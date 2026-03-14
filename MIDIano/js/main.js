import { Render } from "./Rendering/Render.js"
import { UI } from "./ui/UI.js"
import { InputListeners } from "./InputListeners.js"
import { getPlayer, getPlayerState } from "./player/Player.js"
import { loadJson } from "./Util.js"
import { FileLoader } from "./player/FileLoader.js"
import { MidiLoader } from "./MidiLoader.js"
import { Song } from "./Song.js"


/**
 *
 *
 * TODOs:
 *
 * UI:
 * - Accessability
 * - Mobile
 * - Load from URL / circumvent CORS.. Extension?
 * - channel menu
 * - added song info to "loaded songs"
 * - fix the minimize button
 * - Fix fullscreen on mobile
 *
 * Audio
 * - Figure out how to handle different ADSR envelopes / release times for instruments
 * - implement control messages for
 * 		- sostenuto pedal
 * 			- only keys that are pressed while pedal is hit are sustained
 * 		- soft pedal
 * 			- how does that affect sound?
 * - implement pitch shift
 * - settings for playalong:
 * 		- accuracy needed
 * 		- different modes
 *
 * MISC
 * - add starting songs from piano-midi
 * - make instrument choosable for tracks
 * - Metronome
 * - Update readme - new screenshot, install/ run instructions
 * - Choose License
 * -
 * -
 *
 *
 *
 * bugs:
 * - Fix iOS
 * - too long notes disappear too soon
 */
let ui
let loading
let listeners

window.onload = async function () {
	await init()
	loading = true

	//	loadSongFromURL("http://www.piano-midi.de/midis/brahms/brahms_opus1_1_format0.mid")
}

async function init() {
	render = new Render()
	ui = new UI(render)
	listeners = new InputListeners(ui, render)
	renderLoop()

	loadStartingSong()

	loadJson("./js/data/exampleSongs.json", json =>
		ui.setExampleSongs(JSON.parse(json))
	)
}

let render
function renderLoop() {
	render.render(getPlayerState())
	window.requestAnimationFrame(renderLoop)
}
async function loadStartingSong() {
	const domain = window.location.href
	let url = "https://midiano.com/mz_331_3.mid?raw=true" // "https://bewelge.github.io/piano-midi.de-Files/midi/alb_esp1.mid?raw=true" //
	if (domain.split("github").length > 1) {
		url = "https://Bewelge.github.io/MIDIano/mz_331_3.mid?raw=true"
	}

	FileLoader.loadSongFromURL(url, (response, fileName) =>
		getPlayer().loadSong(response, fileName, "Mozart - Turkish March")
	) // Local: "../mz_331_3.mid")
}






// --- ECOUTEUR DE MESSAGE IFRAME CORRIGÉ ---
window.addEventListener("message", async function(event) {
    if (event.data && event.data.command === 'loadExternalMidi') {
        console.log("MIDIano : Réception MIDI...");
        
        try {
            // 1. Récupération du Player
            let player = getPlayer();

            // 2. Pause de sécurité
            if (!player.paused) {
                player.pause();
            }

            // 3. Parsing du MIDI
            let data = new Uint8Array(event.data.buffer);
            let midiData = MidiLoader.loadData(data);
            let song = new Song(midiData, "Partition Solfa");
            
            // 4. Forcer l'instrument "Piano" sur toutes les pistes
            // (Pour éviter l'erreur "Buffer undefined")
            for (let track of song.tracks) {
                track.instrument = "acoustic_grand_piano"; 
            }
            for (let key in song.channels) {
                song.channels[key].instrument = "acoustic_grand_piano";
            }

            // 5. Assigner la chanson au lecteur
            console.log("Assignation de la chanson...");
            player.setSong(song);
            
            // 6. --- ETAPE CRUCIALE (Copie de la logique de Player.js) ---
            // On doit charger les instruments manuellement car on ne passe pas par player.loadSong()
            console.log("Chargement des sons...");
            
            player.audioPlayer.stopAllSources();
            
            // On charge les instruments nécessaires pour cette chanson
            await player.audioPlayer.loadInstrumentsForSong(song);
            
            // On prépare les buffers (décodage audio)
            await player.audioPlayer.loadBuffers();
            
            console.log("Sons chargés ! Lancement...");

            // 7. --- CORRECTION NOM DE FONCTION ---
            // Dans votre Player.js, la fonction est startPlay(), pas play()
            player.startPlay();

        } catch (e) {
            console.error("Erreur critique MIDIano :", e);
        }
    }
});