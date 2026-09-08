import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { palette, num } from '../../../../js/theme.js';

// Shared scene furniture for the "instrument console" theme: a neutral
// studio light rig and a machined deck plate. The old starfield is gone —
// it read as decorative sci-fi, and the point of these scenes is that they
// look like a diagnostic rig, not a space sim.

// The palette lives in css/base.css (the --stage-* tokens) so the scene and the
// chrome around it can never disagree about the theme. THEME keeps its shape —
// every call site still reads THEME.accent and friends — it is just filled in
// from CSS instead of from literals here.
export const THEME = palette( {
	bg: '--stage-bg',
	deck: '--stage-deck',
	grid: '--stage-grid',
	gridAccent: '--stage-grid-accent',
	accent: '--accent',
	signal: '--signal',
	info: '--info',
	danger: '--danger',
	ok: '--ok',
	violet: '--stage-violet',
	rose: '--stage-rose',
	cyan: '--stage-cyan',
	ink: '--stage-ink',
	muted: '--stage-muted',
	shell: '--stage-shell',
	shell2: '--stage-shell-2',
	edge: '--stage-edge',
} );

// Emissive is additive, so the dark-mode glow blows out on a light stage.
export const EMISSIVE = num( '--stage-emissive', 1 );

// For the accent-coloured glow lights the worlds add on their own.
export const RIM_GAIN = num( '--rig-rim-gain', 1 );

// Dark mode keeps neutral shells and lets emissive carry the category colour;
// on a light stage emissive is nearly invisible, so the diffuse colour itself
// is tinted instead. --stage-shell-mix is 0 in dark, so this is a no-op there.
const SHELL_MIX = num( '--stage-shell-mix', 0 );

export function shellColor( accent, base = THEME.shell ) {

	return new THREE.Color( base ).lerp( new THREE.Color( accent ), SHELL_MIX );

}

export function addStandardLighting( scene, accent = THEME.accent ) {

	scene.background = new THREE.Color( THEME.bg );
	scene.fog = new THREE.FogExp2( THEME.bg, 0.022 * num( '--stage-fog-gain', 1 ) );

	// The *-gain tokens carry only the theme delta; the numbers below stay the
	// authored dark-studio balance for this site.
	const rig = palette( { sky: '--rig-sky', ground: '--rig-ground', key: '--rig-key', fill: '--rig-fill' } );

	const hemi = new THREE.HemisphereLight( rig.sky, rig.ground, 0.5 * num( '--rig-hemi-gain', 1 ) );
	scene.add( hemi );

	const key = new THREE.DirectionalLight( rig.key, 1.5 * num( '--rig-key-gain', 1 ) );
	key.position.set( 4, 8, 6 );
	// --stage-shadow-gain is the shadow strength itself; 0 disables the pass.
	const shadowGain = num( '--stage-shadow-gain', 0 );
	if ( shadowGain > 0 ) {

		key.castShadow = true;
		key.shadow.mapSize.set( 1024, 1024 );
		key.shadow.camera.near = 1;
		key.shadow.camera.far = 40;
		key.shadow.camera.left = -14;
		key.shadow.camera.right = 14;
		key.shadow.camera.top = 14;
		key.shadow.camera.bottom = -14;
		key.shadow.bias = -0.0005;
		key.shadow.normalBias = 0.02;
		key.shadow.intensity = shadowGain;

	}
	scene.add( key );

	const fill = new THREE.DirectionalLight( rig.fill, 0.45 * num( '--rig-fill-gain', 1 ) );
	fill.position.set( -6, 2, -4 );
	scene.add( fill );

	const rim = new THREE.PointLight( accent, 2.4 * num( '--rig-rim-gain', 1 ), 30 );
	rim.position.set( -5, 3, -5 );
	scene.add( rim );

	return { hemi, key, fill, rim };

}

// A machined deck plate: a dark slab with a measurement grid on it. Replaces
// the old circular "floor + starfield" pairing.
export function createDeck( size = 16, { y = -1.6, divisions = 32 } = {} ) {

	const group = new THREE.Group();
	// The deck is stage furniture: entrance choreography must not move it.
	group.userData.static = true;

	const plate = new THREE.Mesh(
		new THREE.PlaneGeometry( size, size ),
		new THREE.MeshStandardMaterial( { color: THEME.deck, metalness: 0.3, roughness: 0.85, transparent: true, opacity: 0.75 } ),
	);
	plate.rotation.x = -Math.PI / 2;
	plate.position.y = y;
	plate.receiveShadow = true;
	group.add( plate );

	const grid = new THREE.GridHelper( size, divisions, THEME.gridAccent, THEME.grid );
	grid.position.y = y + 0.005;
	grid.material.transparent = true;
	grid.material.opacity = Math.min( 1, 0.4 * num( '--stage-grid-gain', 1 ) );
	group.add( grid );

	return group;

}

// Opaque solid meshes throw shadows onto the deck; glass, wires and sprites
// would only produce speckle, so they are left out.
export function enableShadows( scene ) {

	scene.traverse( ( child ) => {

		if ( ! child.isMesh ) return;
		const mat = Array.isArray( child.material ) ? child.material[ 0 ] : child.material;
		if ( ! mat || mat.transparent || mat.wireframe ) return;
		child.castShadow = true;

	} );

}

export function createLabel( text, className = 'label2d' ) {

	const el = document.createElement( 'div' );
	el.className = className;
	el.textContent = text;
	return new CSS2DObject( el );

}

// A thin labelled band used to mark a privilege boundary (kernel mode vs user
// mode) or a rack shelf.
export function createShelf( width, depth, { color = THEME.grid, y = 0, opacity = 0.5 } = {} ) {

	const group = new THREE.Group();

	const slab = new THREE.Mesh(
		new THREE.BoxGeometry( width, 0.02, depth ),
		new THREE.MeshBasicMaterial( { color, transparent: true, opacity: opacity * 0.16, depthWrite: false } ),
	);
	slab.position.y = y;
	group.add( slab );

	const edges = new THREE.LineSegments(
		new THREE.EdgesGeometry( new THREE.BoxGeometry( width, 0.02, depth ) ),
		new THREE.LineBasicMaterial( { color, transparent: true, opacity } ),
	);
	edges.position.y = y;
	group.add( edges );

	return group;

}

export function disposeObject3D( obj ) {

	obj.traverse( ( child ) => {

		if ( child.geometry ) child.geometry.dispose();
		if ( child.material ) {

			const mats = Array.isArray( child.material ) ? child.material : [ child.material ];
			mats.forEach( ( m ) => m.dispose() );

		}
		if ( child.isCSS2DObject && child.element && child.element.parentNode ) child.element.parentNode.removeChild( child.element );

	} );
	if ( obj.parent ) obj.parent.remove( obj );

}

// IPCLink now owns its own group and detaches itself, so this is just a
// forwarding helper kept for call-site readability.
export function disposeLink( link ) {

	link.dispose();

}
