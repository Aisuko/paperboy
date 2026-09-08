import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME, RIM_GAIN, EMISSIVE } from '../utils/sceneKit.js';

// 07 · Boot it for real. The full QEMU console log lives in the left-hand
// console; this pane is the machine that log is coming out of — a virtual box
// with a screen mirroring the last few lines, a disk-activity LED that flickers
// while output is arriving, and a power LED that turns green once the login
// prompt appears.

const SCREEN_W = 1024;
const SCREEN_H = 576;
const LINE_H = 34;
const VISIBLE_LINES = 13;

// The CRT is the one thing that does *not* follow the theme. It depicts a
// physical screen inside the scene, and a real terminal is dark whatever the
// desktop around it is doing — so these literals stay literals. The chassis
// around it (bezel, stand, LEDs) does flip, via THEME above.
const LOG_COLORS = {
	cmd: '#4ec9b0',
	ok: '#6fcf7f',
	out: '#9aa8b0',
	dim: '#4a555c',
	note: '#e8a33d',
	warn: '#e8a33d',
	err: '#e5644e',
	head: '#6b7880',
};

function createScreen() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = SCREEN_W;
	canvas.height = SCREEN_H;
	const ctx = canvas.getContext( '2d' );

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;

	const lines = [];

	function draw() {

		ctx.fillStyle = '#070f14';
		ctx.fillRect( 0, 0, SCREEN_W, SCREEN_H );

		// scanline wash, so the plane still reads as a CRT at a glance
		ctx.fillStyle = 'rgba(255,255,255,0.014)';
		for ( let y = 0; y < SCREEN_H; y += 4 ) ctx.fillRect( 0, y, SCREEN_W, 1 );

		ctx.font = '20px "IBM Plex Mono", ui-monospace, monospace';
		ctx.textBaseline = 'top';

		const start = Math.max( 0, lines.length - VISIBLE_LINES );
		for ( let i = start; i < lines.length; i ++ ) {

			const line = lines[ i ];
			ctx.fillStyle = LOG_COLORS[ line.kind ] || LOG_COLORS.out;
			ctx.fillText( line.text.slice( 0, 62 ), 26, 22 + ( i - start ) * LINE_H );

		}

		texture.needsUpdate = true;

	}

	draw();

	return {
		texture,
		push( line ) { lines.push( line ); draw(); },
		clear() { lines.length = 0; draw(); },
	};

}

export function buildQemuWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 18, { y: -1.85, divisions: 36 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	// ---- monitor ----
	const monitor = new THREE.Group();
	monitor.position.set( 0, 0.55, 0 );
	rig.add( monitor );

	// Low metalness + a whisper of emissive: an unlit metallic slab has nothing
	// to reflect here and disappears into the dark stage entirely.
	const bezelGeo = new THREE.BoxGeometry( 3.5, 2.2, 0.16 );
	const bezel = new THREE.Mesh( bezelGeo, new THREE.MeshStandardMaterial( {
		color: THEME.shell, emissive: THEME.muted, emissiveIntensity: 0.22 * EMISSIVE, metalness: 0.2, roughness: 0.6,
	} ) );
	monitor.add( bezel );
	monitor.add( new THREE.LineSegments(
		new THREE.EdgesGeometry( bezelGeo ),
		new THREE.LineBasicMaterial( { color: THEME.accent, transparent: true, opacity: 0.34 } ),
	) );

	const screenFace = createScreen();
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry( 3.24, 1.72 ),
		new THREE.MeshBasicMaterial( { map: screenFace.texture, toneMapped: false } ),
	);
	screen.position.set( 0, 0.14, 0.085 );
	monitor.add( screen );

	const screenGlow = new THREE.PointLight( THEME.accent, 1.4 * RIM_GAIN, 5 );
	screenGlow.position.set( 0, 0, 1.1 );
	monitor.add( screenGlow );

	const stand = new THREE.Mesh(
		new THREE.CylinderGeometry( 0.08, 0.12, 0.5, 12 ),
		new THREE.MeshStandardMaterial( { color: THEME.shell2, emissive: THEME.muted, emissiveIntensity: 0.18 * EMISSIVE, metalness: 0.2, roughness: 0.4 } ),
	);
	stand.position.set( 0, -1.5, 0 );
	monitor.add( stand );

	const foot = new THREE.Mesh(
		new THREE.CylinderGeometry( 0.6, 0.68, 0.06, 24 ),
		new THREE.MeshStandardMaterial( { color: THEME.shell2, emissive: THEME.muted, emissiveIntensity: 0.18 * EMISSIVE, metalness: 0.2, roughness: 0.5 } ),
	);
	foot.position.set( 0, -1.78, 0 );
	monitor.add( foot );

	// Status LEDs on the bezel: power turns green at the login prompt, disk
	// flickers whenever a new line arrives.
	const powerLed = new THREE.Mesh(
		new THREE.SphereGeometry( 0.035, 12, 12 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted } ),
	);
	powerLed.position.set( 1.56, -0.94, 0.09 );
	monitor.add( powerLed );

	const diskLed = new THREE.Mesh(
		new THREE.SphereGeometry( 0.028, 12, 12 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted } ),
	);
	diskLed.position.set( 1.4, -0.94, 0.09 );
	monitor.add( diskLed );

	const chassisLabel = createLabel( 'qemu-system-i386 · 1024M · hd0 · e1000', 'label2d label2d-dim' );
	chassisLabel.position.set( 0, -1.24, 0.1 );
	monitor.add( chassisLabel );

	let diskActivity = 0;
	let booted = false;
	let elapsed = 0;

	return {
		scene,
		interactables: [],
		defaultView: {
			// Camera x sits left of the monitor so the machine lands in the
			// right half of the frame, clear of the HUD copy on the left.
			position: new THREE.Vector3( -1.0, 0.7, 10 ),
			target: new THREE.Vector3( -1.0, -0.35, 0 ),
		},

		// Called by main.js for every line the console prints, so the screen
		// and the LEDs stay in step with the log.
		pushLine( line ) {

			screenFace.push( line );
			diskActivity = 1;

		},

		setBooted( value ) {

			booted = value;
			powerLed.material.color.setHex( value ? THEME.ok : THEME.muted );

		},

		resetScreen() {

			screenFace.clear();
			booted = false;
			powerLed.material.color.setHex( THEME.signal );

		},

		update( dt ) {

			elapsed += dt;
			diskActivity = Math.max( 0, diskActivity - dt * 3.2 );
			diskLed.material.color.setHex( diskActivity > 0.2 ? THEME.signal : THEME.muted );
			screenGlow.intensity = 1.2 + Math.sin( elapsed * 2.4 ) * 0.15 + diskActivity * 0.8;
			if ( ! booted ) powerLed.material.color.setHex( THEME.signal );

		},
	};

}
