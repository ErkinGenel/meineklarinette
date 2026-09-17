import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Music } from 'lucide-react';

const A4_FREQ = 440;
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CLARINET_TRANSPOSITION_SEMITONES = 2; // Bb Clarinet transposition
const BUFFER_SIZE = 2048;

// Calculate MIDI note number from frequency
const noteFromPitch = (frequency) => {
    const noteNum = 12 * (Math.log(frequency / A4_FREQ) / Math.log(2));
    return Math.round(noteNum) + 69; // 69 is A4
};

// Calculate theoretical frequency of a given MIDI note
const frequencyFromNoteNumber = (note) => {
    return A4_FREQ * Math.pow(2, (note - 69) / 12);
};

// Calculate how many cents off the pitch is from the target note
const centsOffFromPitch = (frequency, note) => {
    return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
};

// Format note string from MIDI note number, handling transposition
const getNoteString = (midiNote, applyClarinetTransposition) => {
    let noteToDisplay = midiNote;
    if (applyClarinetTransposition) {
        noteToDisplay = midiNote + CLARINET_TRANSPOSITION_SEMITONES;
    }
    const noteIndex = noteToDisplay % 12;
    const octave = Math.floor(noteToDisplay / 12) - 1;
    return {
        note: NOTE_STRINGS[noteIndex],
        octave: octave
    };
};

const yinPitchDetection = (float32AudioBuffer, sampleRate) => {
    const bufferSize = float32AudioBuffer.length;
    const yinBuffer = new Float32Array(bufferSize / 2);
    let pitchInHertz = -1;
    
    // Step 1: Calculate the difference function
    for (let tau = 0; tau < yinBuffer.length; tau++) {
        yinBuffer[tau] = 0;
        for (let i = 0; i < yinBuffer.length; i++) {
            const delta = float32AudioBuffer[i] - float32AudioBuffer[i + tau];
            yinBuffer[tau] += delta * delta;
        }
    }

    // Step 2: Calculate the cumulative mean normalized difference function
    let runningSum = 0;
    yinBuffer[0] = 1; 
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] *= tau / runningSum;
    }

    // Step 3: Absolute thresholding
    let tauEstimate = -1;
    const threshold = 0.1; 
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
                tau++;
            }
            tauEstimate = tau;
            break;
        }
    }

    // If no pitch found above threshold, search for global minimum
    if (tauEstimate === -1) {
        let minVal = 1;
        for (let tau = 2; tau < yinBuffer.length; tau++) {
            if (yinBuffer[tau] < minVal) {
                minVal = yinBuffer[tau];
                tauEstimate = tau;
            }
        }
        if (minVal > 0.5) return -1;
    }

    // Step 4: Parabolic interpolation for better accuracy
    let betterTau = tauEstimate;
    if (tauEstimate > 0 && tauEstimate < yinBuffer.length - 1) {
        const s0 = yinBuffer[tauEstimate - 1];
        const s1 = yinBuffer[tauEstimate];
        const s2 = yinBuffer[tauEstimate + 1];
        betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }

    if (betterTau !== 0) {
        pitchInHertz = sampleRate / betterTau;
    }

    return pitchInHertz;
};

const StaffVisualization = ({ midiNote, isActive }) => {
    if (!isActive || !midiNote) {
        return (
            <div className="mb-5 w-full max-w-xs flex justify-center bg-white border border-gray-200 rounded-xl shadow-inner py-3 h-[140px] items-center text-gray-400">
                <Music size={48} className="opacity-20" />
            </div>
        );
    }

    const diatonicIndices = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    const hasSharp = [false, true, false, true, false, false, true, false, true, false, true, false];

    const noteIndex = midiNote % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    const diatonicStep = diatonicIndices[noteIndex];
    const isSharp = hasSharp[noteIndex];

    const absoluteStep = (octave * 7) + diatonicStep;
    const e4Step = 30; // E4 is bottom line of treble staff
    const stepDiff = absoluteStep - e4Step;
    const yPos = 100 - (stepDiff * 5);

    const stemPointsDown = yPos < 80;
    
    // Generate Ledger Lines
    const ledgerLines = [];
    if (yPos >= 110) {
        for (let ly = 110; ly <= yPos; ly += 10) {
            ledgerLines.push(<line key={`ly-${ly}`} x1="95" x2="125" y1={ly} y2={ly} stroke="#374151" strokeWidth="1.5" />);
        }
    } else if (yPos <= 50) {
        for (let ly = 50; ly >= yPos; ly -= 10) {
            ledgerLines.push(<line key={`ly-${ly}`} x1="95" x2="125" y1={ly} y2={ly} stroke="#374151" strokeWidth="1.5" />);
        }
    }

    return (
        <div className="mb-5 w-full max-w-xs flex justify-center bg-white border border-gray-200 rounded-xl shadow-inner py-3 h-[140px]">
            <svg width="100%" height="100%" viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet">
                {/* Staff lines */}
                <path d="M 20 60 L 180 60 M 20 70 L 180 70 M 20 80 L 180 80 M 20 90 L 180 90 M 20 100 L 180 100" stroke="#374151" strokeWidth="1.5" fill="none" />
                
                {/* Clef */}
                <text x="25" y="112" fontSize="65" fontFamily="serif" fill="#374151">&#x1D11E;</text>

                {/* Ledger Lines */}
                <g>{ledgerLines}</g>

                {/* Note */}
                <g>
                    <ellipse cx="110" cy={yPos} rx="7" ry="5" fill="#1f2937" transform={`rotate(-15 110 ${yPos})`} />
                    {isSharp && (
                        <text x="85" y={yPos + 6} fontSize="22" fontFamily="serif" fill="#1f2937" fontWeight="bold">♯</text>
                    )}
                    {stemPointsDown ? (
                        <line x1="104" y1={yPos} x2="104" y2={yPos + 35} stroke="#1f2937" strokeWidth="1.5" />
                    ) : (
                        <line x1="116" y1={yPos} x2="116" y2={yPos - 35} stroke="#1f2937" strokeWidth="1.5" />
                    )}
                </g>
            </svg>
        </div>
    );
};

export default function ClarinetDetector() {
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState(null);
    const [showClarinetNote, setShowClarinetNote] = useState(true);
    
    // Tuner state
    const [pitchData, setPitchData] = useState({
        pitch: -1,
        midiNote: null,
        centsOff: 0,
        volume: 0
    });

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const microphoneRef = useRef(null);
    const animationFrameRef = useRef(null);

    const updatePitch = () => {
        if (!analyserRef.current) return;

        const buffer = new Float32Array(BUFFER_SIZE);
        analyserRef.current.getFloatTimeDomainData(buffer);

        let rms = 0;
        for (let i = 0; i < BUFFER_SIZE; i++) {
            rms += buffer[i] * buffer[i];
        }
        rms = Math.sqrt(rms / BUFFER_SIZE);

        if (rms > 0.01) {
            const pitch = yinPitchDetection(buffer, audioContextRef.current.sampleRate);
            
            if (pitch > 50 && pitch < 5000) {
                const midiNote = noteFromPitch(pitch);
                const centsOff = centsOffFromPitch(pitch, midiNote);
                
                setPitchData({
                    pitch,
                    midiNote,
                    centsOff,
                    volume: rms
                });
            }
        } else {
            // Volume too low, reset data
             setPitchData(prev => ({...prev, pitch: -1, volume: rms}));
        }

        animationFrameRef.current = requestAnimationFrame(updatePitch);
    };

    const startListening = async () => {
        try {
            setError(null);
            
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false 
                } 
            });

            microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = BUFFER_SIZE * 2;
            microphoneRef.current.connect(analyserRef.current);
            
            setIsListening(true);
            updatePitch();

        } catch (err) {
            console.error("Error accessing microphone:", err);
            setError(`Could not access microphone: ${err.message}. Please ensure permissions are granted.`);
            setIsListening(false);
        }
    };

    const stopListening = () => {
        setIsListening(false);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (microphoneRef.current) {
            microphoneRef.current.disconnect();
            const tracks = microphoneRef.current.mediaStream.getTracks();
            tracks.forEach(track => track.stop());
            microphoneRef.current = null;
        }
        setPitchData({ pitch: -1, midiNote: null, centsOff: 0, volume: 0 });
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (microphoneRef.current) {
                const tracks = microphoneRef.current.mediaStream.getTracks();
                tracks.forEach(track => track.stop());
            }
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    const isActive = pitchData.pitch > -1;
    const actualFreq = isActive ? pitchData.pitch.toFixed(1) : "0.0";
    const targetFreq = isActive && pitchData.midiNote ? frequencyFromNoteNumber(pitchData.midiNote).toFixed(1) : "0.0";
    
    let displayNote = "--";
    let displayOctave = "Octave -";
    let concertNoteStr = "--";
    let displayMidiNote = null;

    if (isActive && pitchData.midiNote) {
        displayMidiNote = showClarinetNote ? pitchData.midiNote + CLARINET_TRANSPOSITION_SEMITONES : pitchData.midiNote;
        const displayData = getNoteString(pitchData.midiNote, showClarinetNote);
        const concertData = getNoteString(pitchData.midiNote, false);
        
        displayNote = displayData.note;
        displayOctave = `Octave ${displayData.octave}`;
        concertNoteStr = `${concertData.note}${concertData.octave}`;
    }

    let boundedCents = Math.max(-50, Math.min(50, pitchData.centsOff));
    let needleAngle = isActive ? (boundedCents / 50) * 90 : 0;
    
    let centsText = "Perfect pitch";
    let centsBadgeColor = "bg-gray-200 text-gray-700 border-transparent";
    let needleColor = isActive ? "#10b981" : "#9ca3af";

    if (isActive) {
        if (Math.abs(pitchData.centsOff) < 5) {
            centsText = "In Tune";
            centsBadgeColor = "bg-green-100 text-green-700 border-green-200";
            needleColor = "#10b981";
        } else {
            let direction = pitchData.centsOff > 0 ? "Sharp" : "Flat";
            centsText = `${Math.abs(pitchData.centsOff)} cents ${direction}`;
            if (Math.abs(pitchData.centsOff) > 20) {
                centsBadgeColor = "bg-red-100 text-red-700 border-red-200";
                needleColor = "#ef4444";
            } else {
                centsBadgeColor = "bg-yellow-100 text-yellow-700 border-yellow-200";
                needleColor = "#f59e0b";
            }
        }
    } else if (isListening) {
         centsText = "Waiting for sound...";
         centsBadgeColor = "bg-gray-100 text-gray-500 border-transparent";
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans">
            
            {/* Custom Styles for Gauge and Pulse */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes pulse-ring {
                    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                .pulse-active { animation: pulse-ring 2s infinite; }
            `}} />

            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden relative">
                
                {/* Header */}
                <div className="bg-blue-600 p-6 text-white text-center">
                    <h1 className="text-3xl font-bold mb-2">Clarinet Tuner</h1>
                    <p className="text-blue-100 text-sm">Play a note into your microphone</p>
                </div>

                <div className="p-8 flex flex-col items-center">
                    
                    {/* Controls */}
                    <button 
                        onClick={toggleListening}
                        className={`mb-6 font-semibold py-3 px-8 rounded-full shadow-md transition-all duration-300 flex items-center justify-center gap-2 ${
                            isListening 
                            ? 'bg-red-500 hover:bg-red-600 text-white pulse-active' 
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                    >
                        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                        <span>{isListening ? "Stop Listening" : "Start Listening"}</span>
                    </button>

                    {/* Status Indicator */}
                    <div className={`mb-6 px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-300 ${
                        isListening ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}>
                        {isListening ? "Listening to microphone..." : "Microphone inactive"}
                    </div>

                    {/* Clarinet Transposition Toggle */}
                    <div className="mb-6 flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={showClarinetNote}
                                onChange={(e) => setShowClarinetNote(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm font-medium text-gray-700">Show Clarinet Note (Bb)</span>
                        </label>
                    </div>

                    {/* Tuner Display Area */}
                    <div className={`w-full flex flex-col items-center transition-opacity duration-300 ${isListening ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        
                        {/* Visual Gauge Component */}
                        <div className="relative w-[300px] h-[150px] overflow-hidden mx-auto mb-6">
                            {/* Background Arch */}
                            <div className="w-[300px] h-[300px] rounded-full bg-gray-200 absolute top-0 left-0 box-border border-[20px] border-gray-300 border-b-transparent border-r-transparent -rotate-45"></div>
                            
                            {/* Tick Marks */}
                            <div className="absolute w-full h-full top-0 left-0">
                                {[-60, -30, 0, 30, 60].map((deg) => (
                                    <div 
                                        key={deg}
                                        className={`absolute bottom-0 left-1/2 w-[2px] origin-bottom -translate-x-1/2 ${deg === 0 ? 'h-[25px] bg-emerald-500 w-[4px]' : 'h-[15px] bg-gray-400'}`}
                                        style={{ transform: `rotate(${deg}deg) translateY(-135px)` }}
                                    ></div>
                                ))}
                            </div>
                            
                            {/* Needle */}
                            <div 
                                className="absolute bottom-0 left-1/2 w-[4px] h-[120px] origin-bottom -translate-x-1/2 rounded-md transition-transform duration-100 ease-out"
                                style={{ 
                                    backgroundColor: needleColor,
                                    transform: `rotate(${needleAngle}deg)` 
                                }}
                            ></div>
                            
                            {/* Center Pivot */}
                            <div className="w-[30px] h-[30px] bg-gray-700 rounded-full absolute bottom-[-15px] left-1/2 -translate-x-1/2 z-10"></div>
                        </div>

                        {/* Note Text Display */}
                        <div className="text-center mb-4 min-h-[100px]">
                            <div className="text-6xl font-black text-gray-800 tracking-tighter transition-all">{displayNote}</div>
                            <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest mt-1">{displayOctave}</div>
                        </div>

                        {/* Staff Visualization */}
                        <StaffVisualization midiNote={displayMidiNote} isActive={isActive} />

                        {/* Frequency Details */}
                        <div className="flex items-center justify-between w-full max-w-xs bg-gray-50 rounded-lg p-4 border border-gray-100 mb-4">
                            <div className="text-center w-1/2">
                                <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Target</div>
                                <div className="text-lg font-mono text-gray-700">{targetFreq} Hz</div>
                            </div>
                            <div className="h-8 w-px bg-gray-300 mx-2"></div>
                            <div className="text-center w-1/2">
                                <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Detected</div>
                                <div className={`text-lg font-mono font-bold transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                                    {actualFreq} Hz
                                </div>
                            </div>
                        </div>
                        
                        {/* Cents Off Display */}
                        <div className="text-center mb-2">
                            <span className={`text-sm font-medium px-4 py-1 rounded-full border transition-colors ${centsBadgeColor}`}>
                                {centsText}
                            </span>
                        </div>

                        {/* Concert Pitch info */}
                        <div className={`mt-2 text-xs text-gray-400 text-center transition-opacity h-4 ${showClarinetNote && isActive ? 'opacity-100' : 'opacity-0'}`}>
                            Concert Pitch: <span className="font-semibold">{concertNoteStr}</span>
                        </div>
                    </div>
                </div>

                {/* Error Overlay */}
                {error && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-50">
                        <div className="text-red-500 mb-4">
                            <MicOff size={48} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Microphone Error</h3>
                        <p className="text-gray-600 text-center mb-6">{error}</p>
                        <button 
                            onClick={() => setError(null)}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}