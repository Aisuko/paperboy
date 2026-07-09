import * as THREE from 'three';
import { addStandardLighting, createStarfield } from '../utils/sceneKit.js';

// The "07 · Run it for real" page points at the real, installable GNU Hurd
// rather than modelling one of its internals, so the backdrop mocks up the
// one thing that page is actually about: a QEMU window booting the Hurd for
// real, typed out onto the monitor screen as a looping boot log.
const TERMINAL_LINES = [
	{ text: '$ qemu-system-i386 -m 1024 -hda hurd-disk.img', color: '#4dc3ff' },
	{ text: 'SeaBIOS (version 1.16.0-1)', color: '#7d8aa3' },
	{ text: 'Booting from Hard Disk...', color: '#7d8aa3' },
	{ text: 'GNU GRUB  version 2.06', color: '#7d8aa3' },
	{ text: '', color: '#7d8aa3' },
	{ text: 'Loading GNU Mach 1.8 ...', color: '#4ce07a' },
	{ text: 'Loading the Hurd: ext2fs.static ...', color: '#4ce07a' },
	{ text: 'Loading the Hurd: exec ...', color: '#4ce07a' },
	{ text: '', color: '#4ce07a' },
	{ text: 'GNU Mach 1.8: Copyright 1991,1990 Free Software Foundation, Inc.', color: '#7d8aa3' },
	{ text: 'Enabling I/O permission bitmap for kernel ... done', color: '#7d8aa3' },
	{ text: 'task-create: init', color: '#4ce07a' },
	{ text: 'proc: registering as the process server', color: '#4ce07a' },
	{ text: 'auth: registering as the auth server', color: '#4ce07a' },
	{ text: 'ext2fs: /dev/hd0s1: clean, fsck not required', color: '#4ce07a' },
	{ text: 'Hurd bootstrap: translators settling in ...', color: '#4ce07a' },
	{ text: '', color: '#4ce07a' },
	{ text: 'Welcome to a real, running GNU Hurd.', color: '#e7ecf5' },
	{ text: '', color: '#e7ecf5' },
	{ text: 'guest@hurd ~$ _', color: '#4ce07a' },
];

const TOTAL_CHARS = TERMINAL_LINES.reduce( ( sum, line ) => sum + line.text.length + 1, 0 );
const CHARS_PER_SECOND = 26;
const HOLD_SECONDS = 3.5;

const CANVAS_W = 896;
const CANVAS_H = 512;
const PADDING = 18;
const LINE_HEIGHT = 24;
const FONT = `16px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;

function createTerminalScreen() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = CANVAS_W;
	canvas.height = CANVAS_H;
	const ctx = canvas.getContext( '2d' );

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;

	let typedChars = 0;
	let holdTimer = 0;
	let cursorOn = true;
	let blinkTimer = 0;

	function draw() {

		ctx.fillStyle = '#061018';
		ctx.fillRect( 0, 0, CANVAS_W, CANVAS_H );
		ctx.font = FONT;
		ctx.textBaseline = 'top';

		let remaining = Math.floor( typedChars );
		let y = PADDING;
		let cursorX = PADDING;
		let cursorY = PADDING;

		for ( const line of TERMINAL_LINES ) {

			const take = Math.max( 0, Math.min( line.text.length, remaining ) );
			const shown = line.text.slice( 0, take );
			if ( shown ) {

				ctx.fillStyle = line.color;
				ctx.fillText( shown, PADDING, y );

			}
			cursorX = PADDING + ctx.measureText( shown ).width;
			cursorY = y;
			remaining -= line.text.length + 1;
			y += LINE_HEIGHT;
			if ( remaining < 0 ) break;

		}

		if ( typedChars >= TOTAL_CHARS && cursorOn ) {

			ctx.fillStyle = '#4ce07a';
			ctx.fillRect( cursorX + 2, cursorY + 2, 9, LINE_HEIGHT - 6 );

		}

		texture.needsUpdate = true;

	}

	draw();

	return {
		texture,
		update( dt ) {

			if ( typedChars < TOTAL_CHARS ) {

				typedChars = Math.min( TOTAL_CHARS, typedChars + dt * CHARS_PER_SECOND );
				draw();

			} else {

				holdTimer += dt;
				blinkTimer += dt;
				if ( blinkTimer > 0.5 ) { blinkTimer = 0; cursorOn = ! cursorOn; draw(); }
				if ( holdTimer > HOLD_SECONDS ) { holdTimer = 0; typedChars = 0; cursorOn = true; }

			}

		},
	};

}

export function buildQemuWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x4dc3ff );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const monitor = new THREE.Group();

	const frame = new THREE.Mesh(
		new THREE.BoxGeometry( 2.4, 1.5, 0.12 ),
		new THREE.MeshStandardMaterial( { color: 0x0d0d14, metalness: 0.6, roughness: 0.35 } ),
	);
	monitor.add( frame );
	monitor.add( new THREE.LineSegments(
		new THREE.EdgesGeometry( new THREE.BoxGeometry( 2.4, 1.5, 0.12 ) ),
		new THREE.LineBasicMaterial( { color: 0x4dc3ff, transparent: true, opacity: 0.55 } ),
	) );

	const terminal = createTerminalScreen();
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry( 2.1, 1.2 ),
		new THREE.MeshBasicMaterial( { map: terminal.texture, toneMapped: false } ),
	);
	screen.position.z = 0.07;
	monitor.add( screen );

	const glow = new THREE.PointLight( 0x4dc3ff, 3.2, 8 );
	glow.position.set( 0, 0, 0.6 );
	monitor.add( glow );

	const stand = new THREE.Mesh(
		new THREE.CylinderGeometry( 0.06, 0.28, 0.5, 16 ),
		new THREE.MeshStandardMaterial( { color: 0x14141c, metalness: 0.6, roughness: 0.4 } ),
	);
	stand.position.y = -1.0;
	monitor.add( stand );

	// A small disk-activity LED on the stand, flickering with the "boot",
	// so the scene reads as a machine doing something, not a framed poster.
	const led = new THREE.Mesh(
		new THREE.SphereGeometry( 0.03, 12, 12 ),
		new THREE.MeshBasicMaterial( { color: 0x4ce07a, toneMapped: false } ),
	);
	led.position.set( 0.32, -0.86, 0.2 );
	monitor.add( led );

	rig.add( monitor );

	monitor.userData.spin = 0.03;

	let elapsed = 0;
	let ledTimer = 0;

	return {
		scene,
		interactables: [],
		defaultView: {
			position: new THREE.Vector3( 0, 0.4, 4.6 ),
			target: new THREE.Vector3( 0, -0.1, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			monitor.rotation.y = Math.sin( elapsed * 0.15 ) * 0.1;

			terminal.update( dt );

			ledTimer += dt;
			if ( ledTimer > ( 0.15 + Math.random() * 0.35 ) ) {

				ledTimer = 0;
				led.visible = Math.random() > 0.25;

			}

		},
	};

}
