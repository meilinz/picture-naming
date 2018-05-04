# this file imports custom routes into the experiment server

from flask import Blueprint, render_template, request, jsonify, Response, abort, current_app, url_for, redirect
from jinja2 import TemplateNotFound
from functools import wraps
from sqlalchemy import or_

from psiturk.psiturk_config import PsiturkConfig
from psiturk.experiment_errors import ExperimentError
from psiturk.user_utils import PsiTurkAuthorization, nocache

# # Database setup
from psiturk.db import db_session, init_db
from psiturk.models import Participant
from json import dumps, loads

# load the configuration options
config = PsiturkConfig()
config.load_config()
myauth = PsiTurkAuthorization(config)  # if you want to add a password protect route use this

##added imports for file upload support
#some libraries
from flask import send_from_directory
from os import makedirs
import os.path
from werkzeug.utils import secure_filename
from sqlalchemy.orm.exc import NoResultFound
from werkzeug.exceptions import NotFound
#status codes
from psiturk.experiment import STARTED
#upload folder
UPLOADS = config.get('Server Parameters', 'upload_folder')

# explore the Blueprint
custom_code = Blueprint('custom_code', __name__, template_folder='templates', static_folder='static')



###########################################################
#  serving warm, fresh, & sweet custom, user-provided routes
#  add them here
###########################################################
@custom_code.route('/_wav_upload/<uid>/<fname>', methods = ['PUT', 'GET'])
def wav_upload(uid = None, fname = None):
    '''
    Accepts a PUT'ed wav file, saves it and returns the file url.
    Accepts a GET for a file and returns it (if it exists).
    The PUT'ing and GET'ing functionality is bare bones and security is
    pretty much non-existent, only requiring a valid uniqueID and non-finished
    status.
    Somewhere flask typically lets you limit upload sizes but I dunno where psiturk does it (if it does)
    '''
## first task: get user details for saving correctly, all of which are url parameters
    current_app.logger.debug("wav request, method: '{}'; uid: '{}'; file name: '{}'".format(request.method, uid, fname))
    try:
        # lookup user in database
        user = Participant.query.\
               filter(Participant.uniqueid == uid).\
               one()
        #stop request if user is anything but started
        assert user.status == STARTED
    except NoResultFound:
        return jsonify({'error': 'failure to find worker'}), 404
    except AssertionError:
        # for security it might be better to just send back a 'failure to find' message?
        return jsonify({'error': 'uploading and getting files stopped for this user'}), 403

    try:
        path_req = os.path.join(user.hitid,
                user.workerid, user.assignmentid)
        assert fname != None
        filename = secure_filename(fname)
        filename = filename + '.wav'
        current_app.logger.debug("request for file: '{}' at path '{}'".format(filename, path_req))
    except AssertionError:
        return jsonify({'error': 'no filename!'}), 400
    except Exception as e:
        current_app.logger.debug('error in processing: {}'.format(e))
        return jsonify(error= 'user entry is malformed, could not complete request'), 500

    try:
        if request.method == 'PUT':
            save_path = os.path.join(UPLOADS, path_req)
            if not os.path.exists(save_path):
                current_app.logger.debug("making path to: '{}'".format(save_path))
                makedirs(save_path)
            with open(os.path.join(save_path, filename), 'wb') as f:
                current_app.logger.debug("saving file: '{}'".format(os.path.join(save_path, filename)))
                f.write(request.get_data())
            current_app.logger.debug("returning url")
            return jsonify(wav_url=url_for('.wav_upload', uid = uid, fname = fname)), 200
        else:
            return send_from_directory(UPLOADS,
                    filename = os.path.join(path_req, filename))
    except NotFound:
        return jsonify(error = 'no file by that name'), 404
    except Exception as e:
        current_app.logger.debug('something bad happened: {}'.format(e))
        return jsonify(error = 'Server problem'), 500


@custom_code.route("/receive_worker/<task>", methods=['GET'])
def receive_worker(task):
    # Only permit one worker per IP address.
    # TODO make sure this works with the reverse proxy.
    # Maybe use nginx request environ variable HTTP_X_REAL_IP ?
    worker_id = str(request.environ.get("HTTP_X_FORWARDED_FOR")).replace(".", "")

    url = "https://{real_host}/ad?assignmentId={task}&hitId=none&workerId={worker_id}&mode=sandbox" \
            .format(real_host=config.get("Server Parameters", "real_host"),
                    task=task, worker_id=worker_id)

    return redirect(url, code=302)


#----------------------------------------------
# example computing bonus
#----------------------------------------------

@custom_code.route('/compute_bonus', methods=['GET'])
def compute_bonus():
    # check that user provided the correct keys
    # errors will not be that gracefull here if being
    # accessed by the Javascrip client
    if not request.args.has_key('uniqueId'):
        raise ExperimentError('improper_inputs')  # i don't like returning HTML to JSON requests...  maybe should change this
    uniqueId = request.args['uniqueId']

    try:
        # lookup user in database
        user = Participant.query.\
               filter(Participant.uniqueid == uniqueId).\
               one()
        user_data = loads(user.datastring) # load datastring from JSON
        bonus = 0

        for record in user_data['data']: # for line in data file
            trial = record['trialdata']
            if trial['phase']=='TEST':
                if trial['hit']==True:
                    bonus += 0.02
        user.bonus = bonus
        db_session.add(user)
        db_session.commit()
        resp = {"bonusComputed": "success"}
        return jsonify(**resp)
    except:
        abort(404)  # again, bad to display HTML, but...


