/**
 * jspsych-image-audio-response
 * Matt Jaquiery, Feb 2018
 * Meilin Zhan, March 2018
 *
 * plugin for displaying a stimulus and getting an audio response
 *
 * documentation: docs.jspsych.org
 *
 **/

jsPsych.plugins["image-audio-response"] = (function() {

    let plugin = {};

    plugin.info = {
        name: 'image-audio-response',
        description: 'Present an image and retrieve an audio response',
        parameters: {
            stimulus: {
                type: jsPsych.plugins.parameterType.IMAGE,
                pretty_name: 'Stimulus',
                default: undefined,
                description: 'The image to be displayed'
            },
            bufferLength: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: 'Buffer length',
                default: 4000,
                description: 'Length of the audio buffer.'
            },
            postprocessing: {
                type: jsPsych.plugins.parameterType.FUNCTION,
                pretty_name: 'Postprocessing function',
                default: undefined,
                description: 'Function to execute on the audio data prior to saving. '+
                    'Passed the audio data and the return value is saved in the '+
                    'response object. This can be used for saving a file, and generating an id '+
                    'which relates the file to the trial data in the trial response.'
            },
            allowPlayback: {
                type: jsPsych.plugins.parameterType.BOOL,
                pretty_name: 'Allow playback',
                default: true,
                description: 'Whether to allow the participant to play back their '+
                'recording and re-record if unhappy.'
            },
            preRecordingLight: {
                type: jsPsych.plugins.parameterType.HTML_STRING,
                pretty_name: 'Light before recording',
                default: '<div id="jspsych-image-audio-response-light" '+
                    'style="border: 0px solid darkred; background-color: #8b0000a8; '+
                    'width: 20px; height: 20px; border-radius: 20px; margin: 10px auto; '+
                    'display: block;"></div>' + 
                    '<div id="clockDiv" style="font-size: 12px; color: gray; margin-bottom: 10px;">准备录音</div>',
                    description: 'HTML to display while recording is about to start.'
            },
            recordingLight: {
                type: jsPsych.plugins.parameterType.HTML_STRING,
                pretty_name: 'Recording light',
                default: '<div id="jspsych-image-audio-response-light" '+
                    'style="border: 0px solid darkred; background-color: darkred; '+
                    'width: 20px; height: 20px; border-radius: 20px; margin: 10px auto; '+
                    'display: block;"></div>' + 
                    '<div id="clockDiv" style="font-size: 12px; color: gray; margin-bottom: 10px;"></div>',
                    description: 'HTML to display normal light while recording is in progress.'
            },
            recordingLightDim: {
                type: jsPsych.plugins.parameterType.HTML_STRING,
                pretty_name: 'Recording light dim',
                default: '<div id="jspsych-image-audio-response-light" '+
                    'style="border: 0px solid darkred; background-color: #8b0000a8; '+
                    'width: 20px; height: 20px; border-radius: 20px; margin: 10px auto; '+
                    'display: block;"></div>'+
                    '<div id="clockDiv" style="font-size: 12px; color: gray; margin-bottom: 10px;"></div>',
                description: 'HTML to display dim light while recording is in progress.'
            },
            recordingLightOff: {
                type: jsPsych.plugins.parameterType.HTML_STRING,
                pretty_name: 'Recording light (off state)',
                default: '<div id="jspsych-image-audio-response-light" '+
                'style="border: 0px solid darkred; background-color: #8b0000a8; '+
                'width: 20px; height: 20px; border-radius: 20px; margin: 10px auto; '+
                'display: block;"></div>'+
                '<div id="clockDiv" style="font-size: 12px; color: gray; margin-bottom: 10px;">录音停止</div>',
                description: 'HTML to display while recording is not in progress.'
            },
            prompt: {
                type: jsPsych.plugins.parameterType.STRING,
                pretty_name: 'Prompt',
                default: null,
                description: 'Any content here will be displayed under the button.'
            },
            stimulus_duration: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: 'Stimulus duration',
                default: null,
                description: 'How long to hide the stimulus.'
            },
            margin_vertical: {
                type: jsPsych.plugins.parameterType.STRING,
                pretty_name: 'Margin vertical',
                default: '0px',
                description: 'The vertical margin of the button.'
            },
            margin_horizontal: {
                type: jsPsych.plugins.parameterType.STRING,
                pretty_name: 'Margin horizontal',
                default: '8px',
                description: 'The horizontal margin of the button.'
            },
            response_ends_trial: {
                type: jsPsych.plugins.parameterType.BOOL,
                pretty_name: 'Response ends trial',
                default: false,
                description: 'If true, then trial will end when user responds.'
            }
        }
    };

    // Prepare AudioContext to be used in recording.
    let audio_context = new AudioContext;

    plugin.trial = function(display_element, trial) {

        if(typeof trial.stimulus === 'undefined'){
            console.error('Required parameter "stimulus" missing in image-audio-response');
        }
        if(typeof trial.postprocessing === 'undefined'){
            console.error('Required parameter "postprocessing" missing in image-audio-response');
        }
        
        // display stimulus
        let playbackElements = [];
        const stimulusId = 'jspsych-image-audio-response-stimulus';
        const stimulusStyle = 'height: 200px; width: auto;';
        let html = `<img src="${trial.stimulus}" id="${stimulusId}" style="${stimulusStyle}"/>`;

        // add audio element
        const audioId = 'jspsych-image-audio-response-audio-container';
        html += `<div id="${audioId}">${trial.recordingLightOff}</div>`;

        //show prompt if there is one
        if (trial.prompt !== null) {
            html += trial.prompt;
        }
        // add button element
        html += '<div id="jspsych-image-audio-response-player"></div>';
        html += '<div id="jspsych-image-audio-response-buttons"></div>';
        display_element.innerHTML = html;

        // add audio player element
        const playerDiv = display_element.querySelector('#jspsych-image-audio-response-player');
        const audioPlayer = playerDiv.appendChild(document.createElement('audio'));
        audioPlayer.setAttribute('style', 'visibility: hidden;');
        audioPlayer.id = 'jspsych-image-audio-response-audio';
        audioPlayer.controls = true

        // add "next page" button element
        const buttonDiv = display_element.querySelector('#jspsych-image-audio-response-buttons');
        const okayButton = buttonDiv.appendChild(document.createElement('button'));
        okayButton.setAttribute('style', 'visibility: hidden;');
        okayButton.id = 'jspsych-image-audio-response-okay';
        okayButton.textContent = '下一页';
        okayButton.className = 'jspsych-audio-response-button jspsych-btn';
        okayButton.addEventListener('click', end_trial);

        // audio element processing
        function startRecording() {
            // remove existing playback elements
            console.log("----->ask for recording permission")
            playbackElements.forEach(function (id) {
                let element = document.getElementById(id);
                element.innerHTML = "";
            });
            navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(process_audio);
        }

        // TODO: Pause N ms before recording.
        let light = document.querySelector('#jspsych-image-audio-response-audio-container');
        light.innerHTML = trial.preRecordingLight;
        setTimeout(function(){startRecording()}, 3000);
        console.log("-------->count down to 3 secs to start recording");
        //startRecording();

        // start timing
        let start_time = performance.now();

        // store response
        let response = {
            rt: null,
            audioData: null
        };

        let recorder = null;
        // function to handle responses by the subject
        function process_audio(stream) {
            // create media recorder instance to initialize recording
            var input = audio_context.createMediaStreamSource(stream);
            recorder = new Recorder(input);
            console.log("-----> create media recorder instance here");

            let numSeconds = 0;
            let lightIsDim = false;
            let interval = setInterval(() => {
                let light = document.querySelector('#jspsych-image-audio-response-audio-container');
                light.innerHTML = lightIsDim ? trial.recordingLight : trial.recordingLightDim;
                console.log("------> light.innerHTML happens here")
                lightIsDim = !lightIsDim;

                if (numSeconds == trial.bufferLength / 1000) {
                    recorder.stop();
                    recorder.exportWAV((data) => {
                        onRecordingFinish(trial.postprocessing(data));

                        if (trial.allowPlayback)
                            showPlaybackTools(data);
                    });
                    clearInterval(interval);
                } else if (numSeconds == 0) {
                    recorder.record();
                }

                let clock = document.getElementById('clockDiv');
                const displaySeconds = numSeconds > 9 ? numSeconds : '0' + numSeconds;
                clock.innerHTML = '录音中 ' + '00:' + displaySeconds;
                numSeconds++;
            }, 1000, true);
        }

        function showPlaybackTools(data) {
            // Audio Player
            const okayButton = display_element.querySelector('#jspsych-image-audio-response-okay');
            okayButton.setAttribute('style', 'visibility: visible;');

            const audioPlayer = display_element.querySelector('#jspsych-image-audio-response-audio');
            let url = (URL.createObjectURL(data));
            audioPlayer.src = url;
            //audioPlayer.setAttribute('style', 'visibility: visible;'); // comment out this line if we don't want to show the audio player
        }

        function onRecordingFinish(data) {
            // visual indicator
            let light = document.querySelector('#jspsych-image-audio-response-audio-container');
            if (light !== null)
                light.innerHTML = trial.recordingLightOff;
            // measure rt
            let end_time = performance.now();
            let rt = end_time - start_time;
            response.audioData = data;
            response.rt = rt;

            if (trial.response_ends_trial) {
                end_trial();
            }
        }

        // function to end trial when it is time
        function end_trial() {
            // kill any remaining setTimeout handlers
            jsPsych.pluginAPI.clearAllTimeouts();

            // gather the data to store for the trial
            let trial_data = {
                "rt": response.rt,
                "stimulus": trial.stimulus,
                "audioData": response.audioData
            };

            // clear the display
            display_element.innerHTML = '';

            // move on to the next trial
            jsPsych.finishTrial(trial_data);
        }

        // hide image if timing is set
        if (trial.stimulus_duration !== null) {
            jsPsych.pluginAPI.setTimeout(function() {
                display_element.querySelector('#jspsych-image-audio-response-stimulus').style.visibility = 'hidden';
            }, trial.stimulus_duration);
        }
    };

    return plugin;
})();
