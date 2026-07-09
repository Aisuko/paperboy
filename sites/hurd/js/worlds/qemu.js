import * as THREE from 'three';
import { addStandardLighting, createStarfield } from '../utils/sceneKit.js';

// The "07 · Boot simulation" page points at the real, installable GNU Hurd
// rather than modelling one of its internals, so instead of step-by-step
// instructions it mocks up the one thing that page is actually about: a
// QEMU window booting the Hurd for real, typed out as a looping boot log
// on a screen that's scaled every frame to fit inside the viewport.
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

const CANVAS_W = 1600;
const CANVAS_H = 900;
const PADDING = 32;
const LINE_HEIGHT = 40;
const FONT = `24px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;

// The screen is the main page content now (no more step-by-step HUD panel
// next to it), so instead of a small monitor floating in the scene, it's
// scaled every frame to fit inside the viewport at this fixed camera
// distance — sized so the boot log always stays fully on screen instead of
// running off the edges of the window.
// Kept above OrbitControls' minDistance (2.5, set in main.js) so the shared
// controls don't clamp the camera back out and break the fit math.
const CAMERA_DISTANCE = 2.6;
const FOV_RADIANS = 45 * Math.PI / 180;
const SCREEN_BASE_WIDTH = 2.2;
const SCREEN_BASE_HEIGHT = SCREEN_BASE_WIDTH * ( CANVAS_H / CANVAS_W );
const SCREEN_MARGIN = 0.94;

// Reserve room at the top of the viewport for the "07 · Take it further"
// label so the boot log sits under it instead of behind it.
const TOP_CLEARANCE_PX = 170;

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

	const terminal = createTerminalScreen();
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry( SCREEN_BASE_WIDTH, SCREEN_BASE_HEIGHT ),
		new THREE.MeshBasicMaterial( { map: terminal.texture, toneMapped: false } ),
	);
	screen.position.z = 0.07;
	monitor.add( screen );

	const glow = new THREE.PointLight( 0x4dc3ff, 3.2, 8 );
	glow.position.set( 0, 0, 0.6 );
	monitor.add( glow );

	rig.add( monitor );

	// "Contain" fit (the opposite of the old cover fit) — scales the screen
	// to the largest size that still fits entirely inside the viewport, so
	// the boot log never runs off the edges of the window. The available
	// height is shrunk by TOP_CLEARANCE_PX first, and the screen is then
	// anchored under that reserved band rather than centered over it.
	function applyContainScale() {

		const aspect = window.innerWidth / window.innerHeight;
		const visibleHeight = 2 * CAMERA_DISTANCE * Math.tan( FOV_RADIANS / 2 );
		const visibleWidth = visibleHeight * aspect;
		const worldPerPixel = visibleHeight / window.innerHeight;
		const reservedTop = TOP_CLEARANCE_PX * worldPerPixel;
		const availableHeight = Math.max( 0.1, visibleHeight - reservedTop );

		const scale = SCREEN_MARGIN * Math.min( visibleWidth / SCREEN_BASE_WIDTH, availableHeight / SCREEN_BASE_HEIGHT );
		monitor.scale.setScalar( scale );

		const planeHeight = SCREEN_BASE_HEIGHT * scale;
		const topEdgeY = visibleHeight / 2 - reservedTop;
		monitor.position.y = topEdgeY - planeHeight / 2;

	}

	applyContainScale();

	return {
		scene,
		interactables: [],
		defaultView: {
			position: new THREE.Vector3( 0, 0, CAMERA_DISTANCE ),
			target: new THREE.Vector3( 0, 0, 0 ),
		},
		update( dt ) {

			applyContainScale();
			terminal.update( dt );

		},
	};

}
