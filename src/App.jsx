// ... existing code ...
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Music, Trophy, RefreshCw, Activity, Gamepad2, CheckCircle } from 'lucide-react';

const A4_FREQ = 440;
const CLARINET_TRANSPOSITION_SEMITONES = 2; 
const BUFFER_SIZE = 2048;

const NOTE_STRINGS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

const noteFromPitch = (frequency) => {
    const noteNum = 12 * (Math.log(frequency / A4_FREQ) / Math.log(2));
    return Math.round(noteNum) + 69; 
};

const frequencyFromNoteNumber = (note) => A4_FREQ * Math.pow(2, (note - 69) / 12);
const centsOffFromPitch = (frequency, note) => Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));

const yinPitchDetection = (float32AudioBuffer, sampleRate) => {
    const bufferSize = float32AudioBuffer.length;
    const yinBuffer = new Float32Array(bufferSize / 2);
    let pitchInHertz = -1;
    for (let tau = 0; tau < yinBuffer.length; tau++) {
        yinBuffer[tau] = 0;
        for (let i = 0; i < yinBuffer.length; i++) {
            const delta = float32AudioBuffer[i] - float32AudioBuffer[i + tau];
            yinBuffer[tau] += delta * delta;
        }
    }
    let runningSum = 0;
    yinBuffer[0] = 1; 
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] *= tau / runningSum;
    }
    let tauEstimate = -1;
    const threshold = 0.1; 
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauEstimate = tau;
            break;
        }
    }
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
    let betterTau = tauEstimate;
    if (tauEstimate > 0 && tauEstimate < yinBuffer.length - 1) {
        const s0 = yinBuffer[tauEstimate - 1];
        const s1 = yinBuffer[tauEstimate];
        const s2 = yinBuffer[tauEstimate + 1];
        betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }
    if (betterTau !== 0) pitchInHertz = sampleRate / betterTau;
    return pitchInHertz;
};

const StaffVisualization = ({ midiNote }) => {
    if (!midiNote) return (
         <div className="w-full h-full flex items-center justify-center p-4">
            <Music size={48} className="text-gray-200" />
        </div>
    );

    const diatonicIndices = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
    const hasSharp = [false, true, false, true, false, false, true, false, true, false, true, false];

    const noteIndex = midiNote % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    const diatonicStep = diatonicIndices[noteIndex];
    const isSharp = hasSharp[noteIndex];
    const absoluteStep = (octave * 7) + diatonicStep;

    const e4Step = 30;
    const stepDiff = absoluteStep - e4Step;
    const yPos = 100 - (stepDiff * 5);
    const stemPointsDown = yPos < 80;

    const ledgerLines = [];
    if (yPos >= 110) {
        for (let ly = 110; ly <= yPos; ly += 10) ledgerLines.push(<line key={ly} x1="95" x2="125" y1={ly} y2={ly} stroke="#374151" strokeWidth="1.5" />);
    } else if (yPos <= 50) {
        for (let ly = 50; ly >= yPos; ly -= 10) ledgerLines.push(<line key={ly} x1="95" x2="125" y1={ly} y2={ly} stroke="#374151" strokeWidth="1.5" />);
    }

    return (
        <div className="w-full h-full">
             <svg width="100%" height="100%" viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet">
                <path d="M 20 60 L 180 60 M 20 70 L 180 70 M 20 80 L 180 80 M 20 90 L 180 90 M 20 100 L 180 100" stroke="#374151" strokeWidth="1.5" fill="none" />
                <text x="25" y="112" fontSize="65" fontFamily="serif" fill="#374151">{'\uD834\uDD1E'}</text>
                <g>{ledgerLines}</g>
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

const GAME_DIATONIC_INDICES = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const GAME_ACCIDENTALS = ["", "#", "", "b", "", "", "#", "", "#", "", "b", ""];

const generateRandomNote = (clef) => {
    let min = 60, max = 84;
    if (clef === 'bass') { min = 40; max = 64; }
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const GameStaff = ({ targetMidiNote, clef, activePitch }) => {
    if (!targetMidiNote) {
         return (
            <div className="w-full h-48 bg-white border-2 border-gray-100 rounded-xl shadow-inner flex items-center justify-center p-4">
                <Music size={48} className="text-gray-200" />
            </div>
        );
    }

    const noteIndex = targetMidiNote % 12;
    const octave = Math.floor(targetMidiNote / 12) - 1;
    
    const diatonicStep = GAME_DIATONIC_INDICES[noteIndex];
    const accidental = GAME_ACCIDENTALS[noteIndex];
    const absoluteStep = (octave * 7) + diatonicStep;

    let clefSymbol, refStep, yPosCenter;
    
    if (clef === 'treble') {
        clefSymbol = '\uD834\uDD1E';
        refStep = 30; // E4
        yPosCenter = 100;
    } else {
        clefSymbol = '\uD834\uDD22';
        refStep = 18; // G2
        yPosCenter = 100;
    }

    const stepDiff = absoluteStep - refStep;
    const yPos = yPosCenter - (stepDiff * 5); 
    const middleLineStep = clef === 'treble' ? 34 : 22;
    const stemDown = absoluteStep >= middleLineStep;

    const ledgerLines = [];
    if (yPos >= 110) {
        for (let ly = 110; ly <= yPos; ly += 10) ledgerLines.push(<line key={`ly-${ly}`} x1="95" x2="125" y1={ly} y2={ly} stroke="#374151" strokeWidth="1.5" />);
    } else if (yPos <= 50) {
        for (let ly = 50; ly >= yPos; ly -= 10) ledgerLines.push(<line key={`ly-${ly}`} x1="95" x2="125" y1={ly} y2={ly} stroke="#374151" strokeWidth="1.5" />);
    }

    return (
        <div className="w-full h-48 bg-white border-2 border-gray-100 rounded-xl shadow-inner flex items-center justify-center p-4 relative overflow-hidden">
            <svg width="100%" height="100%" viewBox="0 0 220 160" preserveAspectRatio="xMidYMid meet">
                <path d="M 10 60 L 210 60 M 10 70 L 210 70 M 10 80 L 210 80 M 10 90 L 210 90 M 10 100 L 210 100" stroke="#374151" strokeWidth="1.5" fill="none" />
                <text x="15" y={clef === 'treble' ? 112 : 92} fontSize={clef === 'treble' ? "65" : "55"} fontFamily="serif" fill="#374151">{clefSymbol}</text>
                <g>{ledgerLines}</g>
                <g className="transition-all duration-300">
                    <ellipse cx="110" cy={yPos} rx="7" ry="5" fill="#1f2937" transform={`rotate(-15 110 ${yPos})`} />
                    {accidental && <text x="80" y={yPos + 6} fontSize="24" fontFamily="serif" fill="#1f2937" fontWeight="bold">{accidental}</text>}
                    {stemDown ? (
                        <line x1="104" y1={yPos} x2="104" y2={yPos + 35} stroke="#1f2937" strokeWidth="1.5" />
                    ) : (
                        <line x1="116" y1={yPos} x2="116" y2={yPos - 35} stroke="#1f2937" strokeWidth="1.5" />
                    )}
                </g>
            </svg>
            <div className="absolute bottom-2 right-4 text-xs font-mono font-bold text-gray-400">
                 Hearing: {activePitch ? (NOTE_STRINGS[activePitch % 12] + (Math.floor(activePitch / 12) - 1)) : '--'}
            </div>
        </div>
    );
};

const DURATIONS = [
    { name: 'whole', beats: 4 },
    { name: 'half', beats: 2 },
    { name: 'quarter', beats: 1 },
    { name: 'eighth', beats: 0.5 }
];

const generateMelody = (clef, numBars = 1) => {
    // Keep to C major scale for melodies to ensure they are playable and musical
    const scale = clef === 'treble' 
        ? [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79] // C4 to G5
        : [43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62]; // G2 to D4

    let sequence = [];
    let globalBeat = 0;
    // Start on a random note in the lower/middle half of the scale
    let scaleIndex = Math.floor(Math.random() * (scale.length / 2));

    for (let bar = 0; bar < numBars; bar++) {
        let currentBarBeats = 0;
        
        while (currentBarBeats < 4) { // 4/4 time
            let availableBeats = 4 - currentBarBeats;
            // Find durations that fit in the remaining beats of the measure
            let validDurations = DURATIONS.filter(d => d.beats <= availableBeats);
            let durationObj = validDurations[Math.floor(Math.random() * validDurations.length)];

            sequence.push({
                midiNote: scale[scaleIndex],
                duration: durationObj.beats,
                type: durationObj.name,
                startBeat: globalBeat,
                id: Math.random().toString(36)
            });

            currentBarBeats += durationObj.beats;
            globalBeat += durationObj.beats;

            // Move up or down 0 to 2 steps for the next note to create a contiguous melody
            let step = Math.floor(Math.random() * 5) - 2; 
            scaleIndex += step;
            scaleIndex = Math.max(0, Math.min(scale.length - 1, scaleIndex));
        }
    }
    return sequence;
};

const MelodyStaff = ({ sequence, currentIndex, clef, activePitch, numBars = 1 }) => {
    const containerRef = useRef(null);

    // Auto-scroll the staff to keep the current note in view
    useEffect(() => {
        if (containerRef.current && sequence && sequence[currentIndex]) {
            const activeX = 110 + (sequence[currentIndex].startBeat * 65);
            const containerWidth = containerRef.current.clientWidth;
            const scrollLeft = containerRef.current.scrollLeft;
            
            // Scroll if note is out of view bounds (with some padding)
            if (activeX > scrollLeft + containerWidth - 100 || activeX < scrollLeft + 50) {
                containerRef.current.scrollTo({
                    left: Math.max(0, activeX - containerWidth / 2),
                    behavior: 'smooth'
                });
            }
        }
    }, [currentIndex, sequence]);

    if (!sequence || sequence.length === 0) return (
         <div className="w-full h-48 bg-white border-2 border-gray-100 rounded-xl shadow-inner flex items-center justify-center p-4">
            <Music size={48} className="text-gray-200" />
        </div>
    );

    let clefSymbol, refStep, yPosCenter, middleLineStep;
    if (clef === 'treble') {
        clefSymbol = '\uD834\uDD1E'; refStep = 30; yPosCenter = 100; middleLineStep = 34;
    } else {
        clefSymbol = '\uD834\uDD22'; refStep = 18; yPosCenter = 100; middleLineStep = 22;
    }

    const totalWidth = Math.max(380, 110 + (numBars * 4 * 65) + 40);
    const ledgerLines = [];
    
    // Pre-calculate note positions and shapes
    const notesToRender = sequence.map((note, idx) => {
        const noteIndex = note.midiNote % 12;
        const octave = Math.floor(note.midiNote / 12) - 1;
        const diatonicStep = GAME_DIATONIC_INDICES[noteIndex];
        const absoluteStep = (octave * 7) + diatonicStep;
        
        const stepDiff = absoluteStep - refStep;
        const yPos = yPosCenter - (stepDiff * 5); 
        const stemDown = absoluteStep >= middleLineStep;
        
        // Horizontal spacing based on beat position
        const xPos = 110 + (note.startBeat * 65);

        // Track ledger lines needed across the whole staff
        if (yPos >= 110) {
            for (let ly = 110; ly <= yPos; ly += 10) {
                if (!ledgerLines.find(ll => ll.y === ly && ll.x === xPos)) {
                    ledgerLines.push({x: xPos, y: ly});
                }
            }
        } else if (yPos <= 50) {
            for (let ly = 50; ly >= yPos; ly -= 10) {
                if (!ledgerLines.find(ll => ll.y === ly && ll.x === xPos)) {
                    ledgerLines.push({x: xPos, y: ly});
                }
            }
        }

        let isCurrent = idx === currentIndex;
        let isPast = idx < currentIndex;
        
        let color = isCurrent ? '#2563eb' : (isPast ? '#9ca3af' : '#1f2937'); // Blue if current, Grey if past, Black if upcoming

        return { ...note, x: xPos, y: yPos, stemDown, color, isCurrent };
    });

    const barlines = [];
    for (let i = 1; i <= numBars; i++) {
        const barX = 110 + (i * 4 * 65) - 32.5; // halfway between beats
        if (i < numBars) {
            barlines.push(<line key={`bar-${i}`} x1={barX} y1="60" x2={barX} y2="100" stroke="#374151" strokeWidth="1.5" />);
        } else {
            // End barline
            barlines.push(<line key={`end-1`} x1={barX - 6} y1="60" x2={barX - 6} y2="100" stroke="#374151" strokeWidth="1.5" />);
            barlines.push(<line key={`end-2`} x1={barX} y1="60" x2={barX} y2="100" stroke="#374151" strokeWidth="5" />);
        }
    }

    return (
        <div className="relative w-full h-48 bg-white border-2 border-gray-100 rounded-xl shadow-inner overflow-hidden">
            <div ref={containerRef} className="w-full h-full overflow-x-auto overflow-y-hidden custom-scrollbar relative p-4">
                <div style={{ width: `${totalWidth}px`, height: '100%', minWidth: '100%' }} className="relative">
                    <svg width="100%" height="100%" viewBox={`0 0 ${totalWidth} 160`} preserveAspectRatio="xMinYMid meet">
                        {/* Staff Lines */}
                        <path d={`M 10 60 L ${totalWidth - 10} 60 M 10 70 L ${totalWidth - 10} 70 M 10 80 L ${totalWidth - 10} 80 M 10 90 L ${totalWidth - 10} 90 M 10 100 L ${totalWidth - 10} 100`} stroke="#374151" strokeWidth="1.5" fill="none" />
                        <text x="15" y={clef === 'treble' ? 112 : 92} fontSize={clef === 'treble' ? "65" : "55"} fontFamily="serif" fill="#374151">{clefSymbol}</text>
                        
                        {/* Time Signature */}
                        <text x="65" y="80" fontSize="24" fontFamily="serif" fill="#374151" fontWeight="bold">4</text>
                        <text x="65" y="100" fontSize="24" fontFamily="serif" fill="#374151" fontWeight="bold">4</text>

                        {/* Barlines */}
                        <g>{barlines}</g>

                        {/* Ledger Lines */}
                        <g>
                            {ledgerLines.map((ll, i) => (
                                <line key={`ll-${i}`} x1={ll.x - 15} x2={ll.x + 15} y1={ll.y} y2={ll.y} stroke="#374151" strokeWidth="1.5" />
                            ))}
                        </g>

                        {/* Notes */}
                        <g>
                            {notesToRender.map((note) => {
                                const { x, y, stemDown, color, isCurrent, type } = note;
                                return (
                                    <g key={note.id} className="transition-all duration-300">
                                        <ellipse cx={x} cy={y} rx="7" ry="5" fill={type === 'half' || type === 'whole' ? 'transparent' : color} stroke={color} strokeWidth={type === 'half' || type === 'whole' ? "2" : "0"} transform={`rotate(-15 ${x} ${y})`} />
                                        
                                        {/* Accidental */}
                                        {GAME_ACCIDENTALS[note.midiNote % 12] && (
                                            <text x={x - 25} y={y + 6} fontSize="24" fontFamily="serif" fill={color} fontWeight="bold">
                                                {GAME_ACCIDENTALS[note.midiNote % 12]}
                                            </text>
                                        )}
                                        
                                        {/* Stem and Flags */}
                                        {type !== 'whole' && (
                                            <>
                                                {stemDown ? (
                                                    <>
                                                        <line x1={x-6} y1={y} x2={x-6} y2={y+35} stroke={color} strokeWidth="1.5" />
                                                        {type === 'eighth' && <path d={`M ${x-6} ${y+35} Q ${x+9} ${y+20}, ${x-6} ${y+5}`} fill="none" stroke={color} strokeWidth="1.5" />}
                                                    </>
                                                ) : (
                                                    <>
                                                        <line x1={x+6} y1={y} x2={x+6} y2={y-35} stroke={color} strokeWidth="1.5" />
                                                        {type === 'eighth' && <path d={`M ${x+6} ${y-35} Q ${x+17} ${y-20}, ${x+6} ${y-5}`} fill="none" stroke={color} strokeWidth="1.5" />}
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </g>
                                )
                            })}
                        </g>
                    </svg>
                </div>
            </div>
            <div className="absolute bottom-2 right-4 text-xs font-mono font-bold text-gray-400 bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm pointer-events-none">
                 Hearing: {activePitch ? (NOTE_STRINGS[activePitch % 12] + (Math.floor(activePitch / 12) - 1)) : '--'}
            </div>
        </div>
    );
};

function SightReadingMode() {
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [gameState, setGameState] = useState('idle'); 
    const [gameMode, setGameMode] = useState('single'); // 'single' or 'melody'
    const [clef, setClef] = useState('treble');
    const [numBars, setNumBars] = useState(1);
    
    // Single Note State
    const [targetMidiNote, setTargetMidiNote] = useState(null);
    
    // Melody State
    const [melodySequence, setMelodySequence] = useState([]);
    const [currentMelodyIndex, setCurrentMelodyIndex] = useState(0);

    const [showClarinetPitch, setShowClarinetPitch] = useState(true); 
    const [isListening, setIsListening] = useState(false);
    const [activePitch, setActivePitch] = useState(null);
    const [cents, setCents] = useState(0);
    const [error, setError] = useState(null);

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const microphoneRef = useRef(null);
    const animationFrameRef = useRef(null);
    const correctFramesRef = useRef(0);
    const singleTargetFramesNeeded = 10; 

    // Refs to avoid stale closures in the audio loop
    const gameStateRef = useRef('idle');
    const gameModeRef = useRef('single');
    const targetMidiNoteRef = useRef(null);
    const melodySequenceRef = useRef([]);
    const currentMelodyIndexRef = useRef(0);
    const showClarinetPitchRef = useRef(true);
    const numBarsRef = useRef(1);

    // Keep refs synced with state
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
    useEffect(() => { targetMidiNoteRef.current = targetMidiNote; }, [targetMidiNote]);
    useEffect(() => { melodySequenceRef.current = melodySequence; }, [melodySequence]);
    useEffect(() => { currentMelodyIndexRef.current = currentMelodyIndex; }, [currentMelodyIndex]);
    useEffect(() => { showClarinetPitchRef.current = showClarinetPitch; }, [showClarinetPitch]);
    useEffect(() => { numBarsRef.current = numBars; }, [numBars]);

    const nextChallenge = () => {
        correctFramesRef.current = 0;
        if (gameMode === 'single') {
            let newNote;
            do { newNote = generateRandomNote(clef); } while (newNote === targetMidiNoteRef.current); 
            setTargetMidiNote(newNote);
        } else {
            setMelodySequence(generateMelody(clef, numBarsRef.current));
            setCurrentMelodyIndex(0);
        }
    };

    const startGame = () => {
        setScore(0);
        setStreak(0);
        setGameState('playing');
        nextChallenge();
        if (!isListening) startListening();
    };

    const triggerSuccess = () => {
        setGameState('success');
        setScore(prev => prev + (gameModeRef.current === 'melody' ? (50 * numBarsRef.current) : 10));
        setStreak(prev => prev + 1);
        setTimeout(() => {
            nextChallenge();
            setGameState('playing');
        }, 1500); 
    };

    const updatePitch = () => {
        if (!analyserRef.current) return;
        const buffer = new Float32Array(BUFFER_SIZE);
        analyserRef.current.getFloatTimeDomainData(buffer);

        let rms = 0;
        for (let i = 0; i < BUFFER_SIZE; i++) rms += buffer[i] * buffer[i];
        rms = Math.sqrt(rms / BUFFER_SIZE);

        if (rms > 0.01) { 
            const pitch = yinPitchDetection(buffer, audioContextRef.current.sampleRate);
            if (pitch > 50 && pitch < 5000) {
                const rawMidi = noteFromPitch(pitch);
                const currentCents = centsOffFromPitch(pitch, rawMidi);
                
                let detectedMidi = rawMidi;
                if (showClarinetPitchRef.current) detectedMidi += CLARINET_TRANSPOSITION_SEMITONES;
                
                setActivePitch(detectedMidi);
                setCents(currentCents);

                if (gameStateRef.current === 'playing') {
                    if (gameModeRef.current === 'single' && targetMidiNoteRef.current !== null) {
                        if (detectedMidi === targetMidiNoteRef.current) {
                            correctFramesRef.current += 1;
                            if (correctFramesRef.current >= singleTargetFramesNeeded) triggerSuccess();
                        } else {
                            correctFramesRef.current = Math.max(0, correctFramesRef.current - 1);
                        }
                    } else if (gameModeRef.current === 'melody' && melodySequenceRef.current.length > 0) {
                        let cIdx = currentMelodyIndexRef.current;
                        if (cIdx < melodySequenceRef.current.length) {
                            let targetNote = melodySequenceRef.current[cIdx];
                            // Base frames needed on note duration! (e.g. whole note takes 4x longer than quarter)
                            let framesNeeded = targetNote.duration * 12; 

                            if (detectedMidi === targetNote.midiNote) {
                                correctFramesRef.current += 1;
                                if (correctFramesRef.current >= framesNeeded) {
                                    // Note complete! Move to next note in melody
                                    let nextIdx = cIdx + 1;
                                    setCurrentMelodyIndex(nextIdx);
                                    correctFramesRef.current = 0;
                                    
                                    if (nextIdx >= melodySequenceRef.current.length) {
                                        triggerSuccess(); // Completed the whole bar!
                                    }
                                }
                            } else {
                                correctFramesRef.current = Math.max(0, correctFramesRef.current - 1);
                            }
                        }
                    }
                }
            }
        } else {
             setActivePitch(null);
             setCents(0);
             correctFramesRef.current = Math.max(0, correctFramesRef.current - 2);
        }
        animationFrameRef.current = requestAnimationFrame(updatePitch);
    };

    const startListening = async () => {
        try {
            setError(null);
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
            microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = BUFFER_SIZE * 2;
            microphoneRef.current.connect(analyserRef.current);
            
            setIsListening(true);
            updatePitch();
        } catch (err) {
            setError("Microphone access denied.");
            setGameState('idle');
        }
    };

    const stopListening = () => {
        setIsListening(false);
        setGameState('idle');
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (microphoneRef.current) {
            microphoneRef.current.disconnect();
            microphoneRef.current.mediaStream.getTracks().forEach(track => track.stop());
            microphoneRef.current = null;
        }
        setActivePitch(null);
        correctFramesRef.current = 0;
    };

    useEffect(() => { return () => stopListening(); }, []);
    useEffect(() => { if (gameState === 'playing') nextChallenge(); }, [clef, gameMode, numBars]); // Reset when mode/clef/bars changes

    let currentNoteProgress = 0;
    let isNoteMatch = false;

    if (gameMode === 'single') {
        isNoteMatch = activePitch === targetMidiNote;
        currentNoteProgress = Math.min(100, (correctFramesRef.current / singleTargetFramesNeeded) * 100);
    } else if (melodySequence.length > 0 && currentMelodyIndex < melodySequence.length) {
        let currentTarget = melodySequence[currentMelodyIndex];
        isNoteMatch = activePitch === currentTarget.midiNote;
        let framesNeededForNote = currentTarget.duration * 12;
        currentNoteProgress = Math.min(100, (correctFramesRef.current / framesNeededForNote) * 100);
    }

    let centsText = "Waiting for note...";
    let centsBadgeColor = "bg-gray-100 text-gray-500 border-transparent";
    if (activePitch !== null) {
        if (Math.abs(cents) < 15) {
            centsText = "In Tune";
            centsBadgeColor = "bg-green-100 text-green-700 border-green-200";
        } else {
            let direction = cents > 0 ? "Sharp" : "Flat";
            centsText = `${Math.abs(cents)} cents ${direction}`;
            if (Math.abs(cents) > 25) {
                centsBadgeColor = "bg-red-100 text-red-700 border-red-200";
            } else {
                centsBadgeColor = "bg-yellow-100 text-yellow-700 border-yellow-200";
            }
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans pt-24">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 relative">
                <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">Sight Reading</h1>
                        <p className="text-blue-100 text-sm">{gameMode === 'single' ? "Play the note you see!" : "Play the measure!"}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-3xl font-black font-mono">{score}</div>
                        <div className="text-blue-200 text-xs font-bold uppercase tracking-widest">Score</div>
                    </div>
                </div>
                <div className="p-6">
                    {/* Controls Row */}
                    <div className="flex flex-col gap-3 mb-6 bg-slate-100 p-3 rounded-xl">
                        <div className="flex justify-between items-center w-full">
                            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Difficulty</div>
                            <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                                <button onClick={() => setGameMode('single')} className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${gameMode === 'single' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>Single Note</button>
                                <button onClick={() => setGameMode('melody')} className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${gameMode === 'melody' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}>Melody Bar</button>
                            </div>
                        </div>
                        <div className="h-px bg-slate-200 w-full"></div>
                        <div className="flex justify-between items-center w-full">
                            <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Clef</div>
                            <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                                <button onClick={() => setClef('treble')} className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${clef === 'treble' ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-50'}`}>Treble</button>
                                <button onClick={() => setClef('bass')} className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${clef === 'bass' ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-50'}`}>Bass</button>
                            </div>
                        </div>
                        {gameMode === 'melody' && (
                            <>
                                <div className="h-px bg-slate-200 w-full my-1"></div>
                                <div className="flex justify-between items-center w-full">
                                    <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Measures</div>
                                    <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                                        {[1, 2, 3, 4].map(n => (
                                            <button key={n} onClick={() => setNumBars(n)} className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${numBars === n ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}>{n}</button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-end mb-2">
                         {(gameState === 'playing' || gameState === 'success') && streak > 2 && (
                            <div className="flex items-center text-amber-500 font-bold text-sm bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 animate-pulse">
                                <Trophy size={14} className="mr-1" /> {streak} Streak!
                            </div>
                        )}
                    </div>

                    {/* Dynamic Staff Rendering */}
                    <div className="relative mb-6">
                        {gameMode === 'single' ? (
                            <GameStaff targetMidiNote={targetMidiNote} clef={clef} activePitch={activePitch} />
                        ) : (
                            <MelodyStaff sequence={melodySequence} currentIndex={currentMelodyIndex} clef={clef} activePitch={activePitch} numBars={numBars} />
                        )}
                        
                        {/* Note Progress Bar */}
                        {gameState === 'playing' && (
                            <div className={`absolute bottom-0 left-0 h-1 transition-all duration-75 rounded-bl-xl rounded-br-xl ${gameMode === 'melody' ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ width: `${currentNoteProgress}%`, opacity: currentNoteProgress > 0 ? 1 : 0 }} />
                        )}
                        
                        {/* Note match hint flash */}
                        <div className={`absolute inset-0 bg-blue-400 rounded-xl mix-blend-overlay transition-opacity duration-300 pointer-events-none ${isNoteMatch && currentNoteProgress > 30 && gameState === 'playing' ? 'opacity-20' : 'opacity-0'}`}></div>
                        
                        {gameState === 'success' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-600/90 backdrop-blur-sm rounded-xl z-10 transition-all animate-in fade-in zoom-in duration-300">
                                <div className="bg-white text-blue-600 px-8 py-4 rounded-full font-black text-3xl shadow-2xl flex items-center gap-3 transform hover:scale-105 transition-transform">
                                    <CheckCircle size={36} className="text-blue-500" /> 
                                    {gameMode === 'melody' ? 'Measure Complete!' : 'Correct!'}
                                </div>
                                <div className="mt-4 text-blue-100 font-bold tracking-widest text-sm uppercase animate-pulse">Loading next...</div>
                            </div>
                        )}
                    </div>
                    
                    <div className="mb-6 flex flex-col items-center gap-3">
                        {isListening && (
                            <span className={`text-xs font-medium px-3 py-1 rounded-full border ${centsBadgeColor}`}>
                                {centsText}
                            </span>
                        )}
                        <label className="flex items-center cursor-pointer bg-slate-50 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                            <input type="checkbox" className="sr-only peer" checked={showClarinetPitch} onChange={(e) => setShowClarinetPitch(e.target.checked)} />
                            <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
                            <span className="ml-3 text-sm font-medium text-slate-700">Playing Bb Clarinet</span>
                        </label>
                    </div>
                    <div className="flex flex-col items-center">
                        {gameState === 'idle' ? (
                            <button onClick={startGame} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all flex justify-center items-center gap-2 text-lg pulse-btn">
                                <Mic size={24} /> Start Playing
                            </button>
                        ) : (
                            <div className="w-full flex gap-3">
                                <button onClick={stopListening} className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"><MicOff size={20} /> Stop</button>
                                <button onClick={nextChallenge} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"><RefreshCw size={20} /> Skip</button>
                            </div>
                        )}
                        {gameState === 'playing' && (
                            <div className="mt-4 text-sm font-medium text-slate-500 animate-pulse flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div> Listening for pitch...
                            </div>
                        )}
                    </div>
                </div>
                {error && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-50">
                        <div className="text-red-500 mb-4"><MicOff size={48} /></div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Microphone Error</h3>
                        <p className="text-gray-600 text-center mb-6">{error}</p>
                        <button onClick={() => setError(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors">Dismiss</button>
                    </div>
                )}
            </div>
        </div>
    );
}

function ClarinetTuner() {
    const [isListening, setIsListening] = useState(false);
    const [showClarinetNote, setShowClarinetNote] = useState(true);
    const [pitchData, setPitchData] = useState({ pitch: 0, midiNote: null, centsOff: 0, volume: 0 });
    const [error, setError] = useState(null);

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const microphoneRef = useRef(null);
    const animationFrameRef = useRef(null);

    const updatePitch = () => {
        if (!analyserRef.current) return;
        
        const buffer = new Float32Array(BUFFER_SIZE);
        analyserRef.current.getFloatTimeDomainData(buffer);

        let rms = 0;
        for (let i = 0; i < BUFFER_SIZE; i++) rms += buffer[i] * buffer[i];
        rms = Math.sqrt(rms / BUFFER_SIZE);

        if (rms > 0.01) {
            const pitch = yinPitchDetection(buffer, audioContextRef.current.sampleRate);
            if (pitch > 50 && pitch < 5000) {
                const midiNote = noteFromPitch(pitch);
                const centsOff = centsOffFromPitch(pitch, midiNote);
                setPitchData({ pitch, midiNote, centsOff, volume: rms });
            }
        } else {
             setPitchData({ pitch: 0, midiNote: null, centsOff: 0, volume: 0 });
        }

        animationFrameRef.current = requestAnimationFrame(updatePitch);
    };

    const startListening = async () => {
        try {
            setError(null);
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
            microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = BUFFER_SIZE * 2;
            microphoneRef.current.connect(analyserRef.current);
            
            setIsListening(true);
            updatePitch();
        } catch (err) {
            setError("Microphone access denied. Please ensure permissions are granted.");
        }
    };

    const stopListening = () => {
        setIsListening(false);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (microphoneRef.current) {
            microphoneRef.current.disconnect();
            microphoneRef.current.mediaStream.getTracks().forEach(track => track.stop());
            microphoneRef.current = null;
        }
        setPitchData({ pitch: 0, midiNote: null, centsOff: 0, volume: 0 });
    };

    useEffect(() => { return () => stopListening(); }, []);

    const { pitch, midiNote, centsOff } = pitchData;
    const displayMidiNote = (midiNote !== null && showClarinetNote) ? midiNote + CLARINET_TRANSPOSITION_SEMITONES : midiNote;

    let displayNoteStr = "--";
    let displayOctave = "-";
    let concertNoteStr = "--";
    let concertOctave = "-";
    
    if (midiNote !== null) {
        const dIndex = displayMidiNote % 12;
        const dOct = Math.floor(displayMidiNote / 12) - 1;
        displayNoteStr = NOTE_STRINGS[dIndex];
        displayOctave = dOct;

        const cIndex = midiNote % 12;
        const cOct = Math.floor(midiNote / 12) - 1;
        concertNoteStr = NOTE_STRINGS[cIndex];
        concertOctave = cOct;
    }

    const targetFreq = midiNote ? frequencyFromNoteNumber(midiNote).toFixed(1) : "0.0";
    const actualFreq = pitch > 0 ? pitch.toFixed(1) : "0.0";
    
    let boundedCents = Math.max(-50, Math.min(50, centsOff));
    let angle = (boundedCents / 50) * 90;
    
    let centsText = "Perfect pitch";
    let centsBadgeColor = "bg-gray-200 text-gray-700";
    let needleColor = "#9ca3af";

    if (midiNote !== null) {
        if (Math.abs(centsOff) < 5) {
            centsText = "In Tune";
            centsBadgeColor = "bg-green-100 text-green-700 border-green-200";
            needleColor = "#10b981";
        } else {
            let direction = centsOff > 0 ? "Sharp" : "Flat";
            centsText = `${Math.abs(centsOff)} cents ${direction}`;
            if (Math.abs(centsOff) > 20) {
                centsBadgeColor = "bg-red-100 text-red-700 border-red-200";
                needleColor = "#ef4444";
            } else {
                centsBadgeColor = "bg-yellow-100 text-yellow-700 border-yellow-200";
                needleColor = "#f59e0b";
            }
        }
    } else {
         if (isListening) {
             centsText = "Waiting for sound...";
             centsBadgeColor = "bg-gray-100 text-gray-500 border-transparent";
         } else {
             centsBadgeColor = "bg-gray-200 text-gray-700 border-transparent";
         }
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans pt-24">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                <div className="bg-blue-600 p-6 text-white text-center">
                    <h1 className="text-3xl font-bold mb-2">Clarinet Tuner</h1>
                    <p className="text-blue-100 text-sm">Play a note into your microphone</p>
                </div>
                
                <div className="p-8 flex flex-col items-center">
                    <button 
                        onClick={isListening ? stopListening : startListening}
                        className={`mb-8 font-semibold py-3 px-8 rounded-full shadow-md transition-colors duration-200 flex items-center justify-center gap-2 ${isListening ? 'bg-red-500 hover:bg-red-600 text-white pulse-btn' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
                    >
                        {isListening ? <MicOff size={24}/> : <Mic size={24}/>}
                        {isListening ? "Stop Listening" : "Start Listening"}
                    </button>

                    <div className={`mb-6 px-4 py-2 rounded-full text-sm font-medium border ${isListening ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {isListening ? "Listening to microphone..." : "Microphone inactive"}
                    </div>

                    <div className="mb-6 flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={showClarinetNote} onChange={(e) => setShowClarinetNote(e.target.checked)} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm font-medium text-gray-700">Show Clarinet Note (Bb)</span>
                        </label>
                    </div>

                    <div className={`w-full flex flex-col items-center transition-opacity duration-300 ${isListening ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <div className="gauge-container mb-6">
                            <div className="gauge-background"></div>
                            <div className="gauge-marks">
                                <div className="mark" style={{transform: "rotate(-60deg) translateY(-135px)"}}></div>
                                <div className="mark" style={{transform: "rotate(-30deg) translateY(-135px)"}}></div>
                                <div className="mark mark-center" style={{transform: "rotate(0deg) translateY(-135px)"}}></div>
                                <div className="mark" style={{transform: "rotate(30deg) translateY(-135px)"}}></div>
                                <div className="mark" style={{transform: "rotate(60deg) translateY(-135px)"}}></div>
                            </div>
                            <div className="absolute bottom-0 left-[calc(50%-2px)] w-1 h-[120px] rounded transform-origin-bottom transition-transform duration-100 ease-out" style={{ backgroundColor: needleColor, transform: `rotate(${angle}deg)`, transformOrigin: "bottom center" }}></div>
                            <div className="gauge-center"></div>
                        </div>

                        <div className="text-center mb-4">
                            <div className="text-6xl font-black text-gray-800 tracking-tighter leading-none">{displayNoteStr}</div>
                            <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest mt-1">Octave {displayOctave}</div>
                        </div>

                        <div className="mb-5 w-full max-w-xs bg-white border border-gray-200 rounded-xl shadow-inner min-h-[140px] flex items-center justify-center">
                            <StaffVisualization midiNote={displayMidiNote} />
                        </div>

                        <div className="flex items-center justify-between w-full max-w-xs bg-gray-50 rounded-lg p-4 border border-gray-100">
                            <div className="text-center">
                                <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Target</div>
                                <div className="text-lg font-mono text-gray-700">{targetFreq} Hz</div>
                            </div>
                            <div className="h-8 w-px bg-gray-300 mx-4"></div>
                            <div className="text-center">
                                <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Detected</div>
                                <div className="text-lg font-mono font-bold text-blue-600">{actualFreq} Hz</div>
                            </div>
                        </div>
                        
                        <div className="mt-4 text-center">
                            <span className={`text-sm font-medium px-4 py-1.5 rounded-full border ${centsBadgeColor}`}>{centsText}</span>
                        </div>

                        {showClarinetNote && (
                            <div className="mt-4 text-xs font-semibold text-gray-400 text-center bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                                Concert Pitch: {concertNoteStr}{concertOctave}
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-50">
                        <div className="text-red-500 mb-4"><MicOff size={48} /></div>
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

export default function ClarinetDetector() {
    const [mode, setMode] = useState('tuner');

    return (
        <div className="relative font-sans bg-gray-100 min-h-screen overflow-hidden">
            <style>{`
                .gauge-container { position: relative; width: 300px; height: 150px; overflow: hidden; margin: 0 auto; }
                .gauge-background { width: 300px; height: 300px; border-radius: 50%; background-color: #e5e7eb; position: absolute; top: 0; left: 0; box-sizing: border-box; border: 20px solid #d1d5db; border-bottom-color: transparent; border-right-color: transparent; transform: rotate(-45deg); }
                .gauge-marks { position: absolute; width: 100%; height: 100%; top: 0; left: 0; }
                .mark { position: absolute; bottom: 0; left: 50%; width: 2px; height: 15px; background-color: #9ca3af; transform-origin: bottom center; }
                .mark-center { height: 25px; background-color: #10b981; width: 4px; margin-left: -1px; }
                .gauge-center { width: 30px; height: 30px; background-color: #374151; border-radius: 50%; position: absolute; bottom: -15px; left: calc(50% - 15px); z-index: 10; }
                @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); } 70% { box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); } 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); } }
                .pulse-btn { animation: pulse-ring 2s infinite; }
                .custom-scrollbar::-webkit-scrollbar { height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
            
            {/* Floating Navigation Pill */}
            <nav className="absolute top-6 left-0 w-full flex justify-center z-20 pointer-events-none">
                <div className="pointer-events-auto bg-white/90 backdrop-blur-md p-1.5 rounded-full shadow-lg border border-gray-200 flex gap-1">
                    <button 
                        onClick={() => setMode('tuner')}
                        className={`px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all duration-300 ${mode === 'tuner' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
                    >
                        <Activity size={18} /> Tuner
                    </button>
                    <button 
                        onClick={() => setMode('game')}
                        className={`px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all duration-300 ${mode === 'game' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200'}`}
                    >
                        <Gamepad2 size={18} /> Game
                    </button>
                </div>
            </nav>
            
            {/* View Switcher */}
            <div className="h-full w-full">
                {mode === 'tuner' ? <ClarinetTuner /> : <SightReadingMode />}
            </div>
        </div>
    );
}