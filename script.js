// --- GLOBALES ---
        let GLOBAL_MIDI_DATA = []; 
                // --- DICTIONNAIRE DE TONALITÉS ---
        const KEY_OFFSETS = {
            "C": 0, "DO": 0,
            "C#": 1, "DO#": 1, "DB": 1, "REB": 1,
            "D": 2, "RE": 2,
            "D#": 3, "RE#": 3, "EB": 3, "MIB": 3,
            "E": 4, "MI": 4,
            "F": 5, "FA": 5,
            "F#": 6, "FA#": 6, "GB": 6, "SOLB": 6,
            "G": 7, "SOL": 7,
            "G#": 8, "SOL#": 8, "AB": 8, "LAB": 8,
            "A": 9, "LA": 9,
            "A#": 10, "LA#": 10, "BB": 10, "SIB": 10,
            "B": 11, "SI": 11
        };

        // Liste pour l'affichage propre (0 = C, 1 = C#, etc.)
        const DISPLAY_KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];                

        let globalTranspose = 0;
        
        // CONFIG SERVEUR
        const WORKER_FILE_URL = "https://h-rand-solfa-worker.hf.space/convert-file";
        const WORKER_LINK_URL = "https://h-rand-solfa-worker.hf.space/convert-url";
        const PROXY_CORS = "https://cors-proxy.randri-hosea.workers.dev/";


        // ============================================================
        // 1. UI & HELPERS
        // ============================================================
        function setView(mode) {
            const ws = document.getElementById('workspace');
            
            // 1. Réinitialiser les classes du workspace
            ws.className = 'workspace'; 
            if (mode === 'split') ws.classList.add('split');
            if (mode === 'sheet') ws.classList.add('full-sheet');
            if (mode === 'midiano') ws.classList.add('full-midiano');

            // 2. Mettre à jour les boutons (Visual Feedback)
            // On enlève 'active' partout
            document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
            
            // On ajoute 'active' sur le bon bouton
            const activeBtn = document.getElementById(`btn-${mode}`);
            if (activeBtn) activeBtn.classList.add('active');
        }

        async function resetViewer() {
            const v = document.getElementById('solfa-viewer');
            v.innerHTML = '<div style="text-align:center; padding-top:50px;"><div class="loader"></div> Chargement...</div>';
            return v;
        }

        // ============================================================
        // 2. CHARGEMENT & IMPORT (Votre logique exacte conservée)
        // ============================================================
        
        async function loadAndAnalyze() {
            const type = document.getElementById('typeSelect').value;
            const num = document.getElementById('numInput').value;
            const viewer = await resetViewer();

            try {
                const source = `${PROXY_CORS}https://mofonaina-cabea.web.app`;
                const response = await fetch(`${source}/solfa/${type}/${num}.html`);
                if (!response.ok) throw new Error("Introuvable");
                const text = await response.text();
                injectAndScan(text, viewer);
            } catch (e) {
                viewer.innerHTML = `<div style='color:red; text-align:center; margin-top:20px;'>${e.message}</div>`;
            }
        }

        async function handleFileSelect(input) {
            if (!input.files.length) return;
            const file = input.files[0];
            const viewer = await resetViewer();
            try {
                if (file.name.endsWith('.html')) {
                    const r = new FileReader();
                    r.onload = e => injectAndScan(e.target.result, viewer);
                    r.readAsText(file);
                } else if (file.name.endsWith('.pdf')) {
                    const fd = new FormData(); fd.append("file", file);
                    const res = await fetch(WORKER_FILE_URL, {method:'POST', body:fd});
                    if(!res.ok) throw new Error("Erreur serveur PDF");
                    injectAndScan(await res.text(), viewer);
                }
            } catch (e) { viewer.innerHTML = `<div style='color:red;'>${e.message}</div>`; }
            input.value = '';
        }

        async function handleUrlImport() {
            const url = document.getElementById('urlInput').value.trim();
            if(!url) return;
            const viewer = await resetViewer();
            try {
                let target = url.endsWith('.pdf') ? 
                    `${WORKER_LINK_URL}?url=${encodeURIComponent(url)}` : `${PROXY_CORS}${url}`;
                const res = await fetch(target);
                if(!res.ok) throw new Error("Erreur URL");
                injectAndScan(await res.text(), viewer);
            } catch (e) { viewer.innerHTML = `<div style='color:red;'>${e.message}</div>`; }
        }

        function injectAndScan(html, viewer) {
            viewer.innerHTML = html;
            // Scripts hack
            viewer.querySelectorAll("script").forEach(old => {
                if (old.src) old.remove();
                const n = document.createElement("script");
                n.textContent = old.textContent;
                document.body.appendChild(n);
                setTimeout(() => n.remove(), 50);
            });
            // Observer SVG
            const obs = new MutationObserver(() => {
                const svg = viewer.querySelector('svg');
                if (svg) {
                    obs.disconnect();
                    setTimeout(() => processStructureToMidi(svg, viewer), 400);
                }
            });
            obs.observe(viewer, { childList: true, subtree: true });
        }

        // ============================================================
        // 3. VOTRE PARSEUR (STRICTEMENT IDENTIQUE)
        // ============================================================
        function processStructureToMidi(svg, viewer) {
            const textNodes = Array.from(svg.querySelectorAll('text'));
            const linesMap = {}; const yTolerance = 3;
            // 1. Extraction brute du texte pour analyse
            let fullPageText = "";
                    
            textNodes.forEach(t => {
                const text = t.textContent.trim();
                if(!text) return;
                fullPageText += " " + text; // On compile tout le texte
                const yRaw = parseFloat(t.getAttribute('y')||0); 
                let foundY=null; 
                for(const k in linesMap){if(Math.abs(yRaw-parseFloat(k))<=yTolerance){foundY=k;break;}}
                const key=foundY||yRaw.toFixed(1); 
                if(!linesMap[key])linesMap[key]=[]; linesMap[key].push(t);
            });

            detectAndSetKey(fullPageText);

            let analyzedLines = [];
            Object.keys(linesMap).sort((a,b)=>parseFloat(a)-parseFloat(b)).forEach(yKey => {
                const elements = linesMap[yKey];
                elements.sort((a,b)=>parseFloat(a.getAttribute('x'))-parseFloat(b.getAttribute('x')));
                const fullText = elements.map(e=>e.textContent.trim()).join(" ");
                if(fullText.length<2)return;
                
                let type='lyrics';
                if(/D[oô]\s*dia/i.test(fullText)||/\d+\s*\/\s*\d+/.test(fullText)) type='meta';
                else {
                    const c=(fullText.match(/:/g)||[]).length, p=(fullText.match(/\|/g)||[]).length;
                    if((c+p)>=2 && /[sdfmrltd]/i.test(fullText)) type='music'; else if((c+p)>=3) type='music';
                }
                analyzedLines.push({y:parseFloat(yKey),type:type,text:fullText,elements:elements});
            });

            let sections = [], currentSection = {title:"Section 1", rhythm:"4/4", lines:[]}, hasStarted=false;
            analyzedLines.forEach(line => {
                if(line.type==='meta') {
                    const rMatch = line.text.match(/(\d+)\s*\/\s*(\d+)/);
                    if(/D[oô]\s*dia/i.test(line.text) || rMatch) {
                        if(hasStarted && currentSection.lines.some(l=>l.type==='music')) sections.push(currentSection);
                        currentSection = {title:line.text, rhythm:rMatch?`${rMatch[1]}/${rMatch[2]}`:currentSection.rhythm, lines:[]};
                        hasStarted=true;
                    }
                } else currentSection.lines.push(line);
            });
            if(currentSection.lines.some(l=>l.type==='music')) sections.push(currentSection);

            GLOBAL_MIDI_DATA = [];
            let globalTimeCursor = 0; 
            const baseOctaves = [4, 4, 3, 2]; 

            sections.forEach((sec, idx) => {
                const rawVoices = extractRawVoices(sec.lines, viewer);
                const audioVoices = rawVoices.map(v => normalizeAndCountNotes(v, sec.rhythm, false));
                let maxDurationInSection = 0;

                for(let v=0; v<4; v++) {
                    const voiceEvents = parseSolfaToEvents(audioVoices[v], baseOctaves[v]);
                    voiceEvents.forEach(evt => {
                        const absStart = globalTimeCursor + evt.time;
                        GLOBAL_MIDI_DATA.push({
                            note: evt.note,
                            midi: Tone.Frequency(evt.note).toMidi(),
                            time: absStart,
                            duration: evt.duration,
                            voice: v
                        });
                        if (evt.time + evt.duration > maxDurationInSection) {
                            maxDurationInSection = evt.time + evt.duration;
                        }
                    });
                }
                globalTimeCursor += maxDurationInSection + 4; 
            });

            console.log("Analyse terminée. Envoi automatique à MIDIano...");
            // AUTO-ENVOI VERS MIDIANO
            sendMidiToMidiano(); 
        }

        function detectAndSetKey(fullText) {
            // 1. Reset par défaut (C / Do)
            globalTranspose = 0;
            
            // 2. Regex pour trouver "Do dia [Note]"
            // Accepte : "Do dia G", "Do dia Sol", "Do dia Bb", "Do dia Fa#"
            const match = fullText.match(/D[oô]\s*dia\s*([a-zA-Z]+[#b]?)/i);
            
            if (match && match[1]) {
                const detectedKey = match[1].toUpperCase();
                
                // On vérifie si la clé existe dans notre dictionnaire
                if (KEY_OFFSETS.hasOwnProperty(detectedKey)) {
                    globalTranspose = KEY_OFFSETS[detectedKey];
                    console.log(`Tonalité détectée : ${detectedKey} (+${globalTranspose})`);
                }
            }

            // 3. Mettre à jour l'affichage UI immédiatement
            updateTransposeUI();
        }

        function updateTransposeUI() {
            const el = document.getElementById('transDisplay');
            
            // Convertir le chiffre (ex: 7) en note (ex: "G")
            // Le modulo 12 assure qu'on reste dans les notes (0-11)
            const noteIndex = ((globalTranspose % 12) + 12) % 12;
            const noteName = DISPLAY_KEYS[noteIndex];
            
            el.innerText = noteName;
            el.style.color = globalTranspose === 0 ? '#aaa' : '#8b5cf6'; // Violet si modifié
        }


        // Remplacez la fonction updateTranspose par celle-ci :
        function updateTranspose(val) {
            // 1. Mise à jour de la valeur
            globalTranspose += val;

            // 2. Mise à jour UI
            updateTransposeUI();

            // 3. Envoi à MIDIano (Live)
            clearTimeout(transposeTimer);
            transposeTimer = setTimeout(() => {
                if (GLOBAL_MIDI_DATA.length > 0) {
                    sendMidiToMidiano();
                    // Feedback visuel
                    const noteIndex = ((globalTranspose % 12) + 12) % 12;
                    showToast(`Tonalité : ${DISPLAY_KEYS[noteIndex]}`, "success");
                }
            }, 500);
        }

        // --- Fonctions Parsing STRICTEMENT ORIGINALES ---
        function parseSolfaToEvents(str, baseOctave) {
            const events = []; 
            let clean = str.replace(/\|/g, ":"); 
            const beats = clean.split(':'); 
            let curT = 0; let last = null;

            beats.forEach(b => {
                let txt = b.trim();
                txt = txt.replace(/\.,/g, ".").replace(/,\./g, "."); 

                if(!txt) { curT+=1; return; }
                const items = txt.split(/[.\s]+/).filter(x=>x.length>0);
                const cnt = items.length; if(cnt===0){curT+=1;return;}
                const dur = 1.0/cnt;

                items.forEach((it, idx) => {
                    const start = curT + (idx*dur);
                    if(it.includes('-')||it.includes('–')){ if(last) last.duration+=dur; }
                    else {
                        const f = solfaToNoteStrict(it, baseOctave);
                        if(f) { const e={note:f, time:start, duration:dur}; events.push(e); last=e; } else last=null;
                    }
                });
                curT+=1;
            });
            return events;
        }

        function solfaToNoteStrict(dirtyInput, baseOctave) {
            const match = dirtyInput.toLowerCase().match(/^([drmfslt]i?)([,']*)/);
            if (!match) return null;
            const noteName = match[1];
            const modifiers = match[2];
            let octave = baseOctave;
            octave -= (modifiers.match(/,/g) || []).length;
            octave += (modifiers.match(/'/g) || []).length;
            let pitch = "";
            const baseChar = noteName.charAt(0);
            
            if(baseChar === 'd') pitch="C";
            else if(baseChar === 'r') pitch="D";
            else if(baseChar === 'm') pitch="E";
            else if(baseChar === 'f') pitch="F";
            else if(baseChar === 's') pitch="G";
            else if(baseChar === 'l') pitch="A";
            else if(baseChar === 't') pitch="B";

            if(noteName.endsWith('i') && noteName !== 'si' && noteName !== 'mi') pitch += "#";

            return pitch + octave;
        }

        function extractRawVoices(lines, viewer) {
            let v1=[],v2=[],v3=[],v4=[], cb=[];
            lines.forEach(l=>{ if(l.type==='music')cb.push(l); else if(l.type==='lyrics'){if(cb.length>0){dist(cb,v1,v2,v3,v4);cb=[];}} });
            if(cb.length>0)dist(cb,v1,v2,v3,v4);
            return [v1.join(":"), v2.join(":"), v3.join(":"), v4.join(":")];
        }
        function dist(b,v1,v2,v3,v4){
            b.forEach((l,i)=>{
                let t=i+1; if(b.length===2){if(i===0)t=1;if(i===1)t=3;}
                if(t===1)v1.push(l.text); if(t===2)v2.push(l.text); if(t===3)v3.push(l.text); if(t===4)v4.push(l.text);
            });
        }
        function normalizeAndCountNotes(rawString) {
            if (!rawString) return "";
            let clean = rawString.replace(/\|/g, " : ");
            const segments = clean.split(':');
            let allNotes = [];
            segments.forEach(segment => {
                const trimmed = segment.trim();
                if (trimmed.length === 0) { allNotes.push(" "); } 
                else { const parts = trimmed.split(/\s+/); parts.forEach(p => { if (p.length > 0) allNotes.push(p); }); }
            });
            return allNotes.join(" : ");
        }

        // ============================================================
        // 4. COMMUNICATION AVEC MIDIANO
        // ============================================================

        function sendMidiToMidiano() {
            if (GLOBAL_MIDI_DATA.length === 0) return showToast("Aucune partition chargée !");

            const writer = new MidiWriter.Writer([]);
            
            for(let v=0; v<4; v++) {
                const track = new MidiWriter.Track();
                track.addTrackName(`Voix ${v+1}`);
                track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1})); // Piano standard
                
                // Tri et création des notes
                const notes = GLOBAL_MIDI_DATA.filter(n => n.voice === v).sort((a,b) => a.time - b.time);
                
                notes.forEach(n => {
                    const transNote = Tone.Frequency(n.note).transpose(globalTranspose).toNote();
                    const durationTicks = Math.round(n.duration * 128); 
                    const startTick = Math.round(n.time * 128);
                    
                    track.addEvent(new MidiWriter.NoteEvent({
                        pitch: [transNote], duration: 'T' + durationTicks, startTick: startTick
                    }));
                });
                writer.tracks.push(track);
            }

            // 2. Création Blob et Envoi
            const midiBlob = new Blob([writer.buildFile()], {type: "audio/midi"});
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                const iframe = document.getElementById('midianoFrame');
                
                // Envoi du message
                iframe.contentWindow.postMessage({
                    command: 'loadExternalMidi',
                    buffer: arrayBuffer
                }, '*');
            };
            reader.readAsArrayBuffer(midiBlob);
        }



// --- GESTION DU RESIZER (DRAG & DROP) ---
    const resizer = document.getElementById('dragHandle');
    const sheetPanel = document.getElementById('sheetPanel');
    const midianoPanel = document.getElementById('midianoPanel');
    const workspace = document.getElementById('workspace');

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'row-resize';
        iframePointerEvents(false); // Désactive les événements souris sur l'iframe pour fluidifier le drag
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        // On vérifie si on est en mode "colonne" (petit écran) ou "ligne" (grand écran)
        const isHorizontalLayout = window.innerWidth >= 1024;

        if (isHorizontalLayout) {
            // --- MODE GRAND ÉCRAN (GAUCHE / DROITE) ---
            const containerWidth = workspace.offsetWidth;
            let newWidthPercent = (e.clientX) / containerWidth * 100; 
            
            // Limites pour ne pas écraser les panneaux
            if (newWidthPercent < 20) newWidthPercent = 20; 
            if (newWidthPercent > 80) newWidthPercent = 80;

            sheetPanel.style.flex = `0 0 ${newWidthPercent}%`;
            midianoPanel.style.flex = `1 1 auto`;
            
            // On nettoie la hauteur forcée par le mode mobile
            sheetPanel.style.height = '100%'; 

        } else {
            // --- MODE PETIT ÉCRAN (HAUT / BAS) ---
            const containerHeight = workspace.offsetHeight;
            let navHeight = document.querySelector('.navbar').offsetHeight; // Calcul dynamique
            
            let newHeightPercent = (e.clientY - navHeight) / containerHeight * 100;
            
            if (newHeightPercent < 20) newHeightPercent = 20;
            if (newHeightPercent > 80) newHeightPercent = 80;

            sheetPanel.style.flex = `0 0 ${newHeightPercent}%`;
            midianoPanel.style.flex = `1 1 auto`;
            
            // On nettoie la largeur forcée par le mode desktop
            sheetPanel.style.width = '100%'; 
        }
    });

    /*/
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerHeight = workspace.offsetHeight;
        // Calcul du pourcentage (borné entre 10% et 90%)
        let newHeightPercent = (e.clientY - 64) / containerHeight * 100; // 64 = hauteur navbar
        if (newHeightPercent < 10) newHeightPercent = 10;
        if (newHeightPercent > 90) newHeightPercent = 90;

        sheetPanel.style.flex = `0 0 ${newHeightPercent}%`;
        midianoPanel.style.flex = `1 1 auto`; // Le reste pour MIDIano
    });
    /*/

    document.addEventListener('mouseup', () => {
        if(isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            iframePointerEvents(true);
        }
    });

    function iframePointerEvents(enable) {
        const frame = document.getElementById('midianoFrame');
        frame.style.pointerEvents = enable ? 'auto' : 'none';
    }

    // --- SYSTEME DE NOTIFICATION TOAST ---
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const msg = document.getElementById('toastMsg');
        const icon = toast.querySelector('i');

        msg.innerText = message;
        toast.className = type === 'error' ? 'error' : 'success';
        
        icon.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';

        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // REMPLACEZ VOS showToast() PAR showToast() DANS VOTRE CODE :
    // Exemple : showToast("Partition chargée !", "success");
    // Exemple : showToast("Erreur de chargement", "error");
    
document.addEventListener("DOMContentLoaded", () => {
    // On lit les paramètres dans l'URL (ce qu'il y a après le '?')
    const urlParams = new URLSearchParams(window.location.search);
    
    // ==========================================
    // 1. GESTION DE : ?play=chant-numero
    // ==========================================
    const playParam = urlParams.get('play');
    if (playParam) {
        // Vérifie le format exact (ex: ffpm-12)
        const match = playParam.match(/^(ffpm|ff|antema|tsanta)-([1-9][0-9]{0,2})$/i);
        
        if (match) {
            const recueil = match[1].toLowerCase(); // ex: "ffpm"
            const numero = match[2];                // ex: "12"
            
            console.log(`▶️ Chargement auto : ${recueil} n°${numero}`);
            showToast(`Chargement de ${recueil.toUpperCase()} ${numero}...`, "success");
            
            // ASTUCE : On remplit vos inputs HTML invisibles ou visibles
            const typeSelect = document.getElementById('typeSelect');
            const numInput = document.getElementById('numInput');
            const loadAndPlay = document.getElementById('load-and-play');
            
            if (typeSelect && numInput && loadAndPlay) {
                typeSelect.value = recueil;
                numInput.value = numero;
                
                const midianoFrame = document.getElementById('midianoFrame');
                
                // On vérifie que l'iframe existe bien sur la page
                if (midianoFrame) {
                    // On déclenche le clic UNIQUEMENT quand l'iframe a fini de charger
                    midianoFrame.addEventListener('load', () => {
                        console.log("✅ MIDIano est prêt, lancement de la lecture auto !");
                        
                        setTimeout(() => {
                            loadAndPlay.click();
                        }, 2000);
                    });
                } else {
                    // Sécurité de secours au cas où l'iframe n'est pas trouvé
                    window.addEventListener('load', () => {
                        setTimeout(() => {
                            loadAndPlay.click();
                        }, 2000);
                    });
                }
            }
        } else {
            showToast("Lien de chant invalide", "error");
        }
    }

    // ==========================================
    // 2. GESTION DE : ?link=url-du-pdf
    // ==========================================
    const linkParam = urlParams.get('link');
    if (linkParam) {
        console.log(`📄 Chargement PDF auto : ${linkParam}`);
        showToast("Chargement du document...", "success");
        
        const urlInput = document.getElementById('urlInput');
        if(urlInput) {
            // On remplit votre input URL
            urlInput.value = linkParam;
            
            // On déclenche VOTRE fonction
            handleUrlImport();
        }
    }
});