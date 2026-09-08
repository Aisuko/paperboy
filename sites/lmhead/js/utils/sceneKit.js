import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { palette, num, isLight } from '../../../../js/theme.js';

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
	violet: '--stage-violet',
	rose: '--stage-rose',
	ink: '--stage-ink',
	muted: '--stage-muted',
	off: '--stage-off',
} );

// Emissive is additive, so the dark-mode glow blows out on a light stage.
export const EMISSIVE = num( '--stage-emissive', 1 );

export { isLight };

export function addStandardLighting( scene, accent = THEME.accent ) {

	scene.background = new THREE.Color( THEME.bg );
	scene.fog = new THREE.FogExp2( THEME.bg, 0.011 * num( '--stage-fog-gain', 1 ) );

	// The *-gain tokens carry only the theme delta; the numbers below stay the
	// authored dark-studio balance for this site.
	const rig = palette( { sky: '--rig-sky', ground: '--rig-ground', key: '--rig-key', fill: '--rig-fill' } );

	scene.add( new THREE.HemisphereLight( rig.sky, rig.ground, 0.5 * num( '--rig-hemi-gain', 1 ) ) );

	const key = new THREE.DirectionalLight( rig.key, 1.4 * num( '--rig-key-gain', 1 ) );
	key.position.set( 4, 8, 10 );
	// --stage-shadow-gain is the shadow strength itself; 0 disables the pass.
	const shadowGain = num( '--stage-shadow-gain', 0 );
	if ( shadowGain > 0 ) {

		key.castShadow = true;
		key.shadow.mapSize.set( 1024, 1024 );
		key.shadow.camera.near = 1;
		key.shadow.camera.far = 60;
		key.shadow.camera.left = -24;
		key.shadow.camera.right = 24;
		key.shadow.camera.top = 24;
		key.shadow.camera.bottom = -24;
		key.shadow.bias = -0.0005;
		key.shadow.normalBias = 0.02;
		key.shadow.intensity = shadowGain;

	}
	scene.add( key );

	const fill = new THREE.DirectionalLight( rig.fill, 0.4 * num( '--rig-fill-gain', 1 ) );
	fill.position.set( -6, 2, -4 );
	scene.add( fill );

	const rim = new THREE.PointLight( accent, 1.6 * num( '--rig-rim-gain', 1 ), 40 );
	rim.position.set( -6, 4, -6 );
	scene.add( rim );

}

export function createDeck( size = 60, { y = -4.2, divisions = 60 } = {} ) {

	const group = new THREE.Group();
	// The deck is stage furniture: entrance choreography must not move it.
	group.userData.static = true;

	const plate = new THREE.Mesh(
		new THREE.PlaneGeometry( size, size ),
		new THREE.MeshStandardMaterial( { color: THEME.deck, metalness: 0.3, roughness: 0.85, transparent: true, opacity: 0.7 } ),
	);
	plate.rotation.x = -Math.PI / 2;
	plate.position.y = y;
	plate.receiveShadow = true;
	group.add( plate );

	const grid = new THREE.GridHelper( size, divisions, THEME.gridAccent, THEME.grid );
	grid.position.y = y + 0.005;
	grid.material.transparent = true;
	grid.material.opacity = Math.min( 1, 0.3 * num( '--stage-grid-gain', 1 ) );
	group.add( grid );

	return group;

}

export function createLabel( text, className = 'label2d' ) {

	const el = document.createElement( 'div' );
	el.className = className;
	el.textContent = text;
	return new CSS2DObject( el );

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
