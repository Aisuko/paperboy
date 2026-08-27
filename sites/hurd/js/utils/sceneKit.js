import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Shared scene furniture for the "instrument console" theme: a neutral
// studio light rig and a machined deck plate. The old starfield is gone —
// it read as decorative sci-fi, and the point of these scenes is that they
// look like a diagnostic rig, not a space sim.

export const THEME = {
	bg: 0x07090b,
	deck: 0x0c1113,
	grid: 0x1c262b,
	gridAccent: 0x2c4a48,
	accent: 0x4ec9b0,
	signal: 0xe8a33d,
	ink: 0xdfe6ea,
};

export function addStandardLighting( scene, accent = THEME.accent ) {

	scene.background = new THREE.Color( THEME.bg );
	scene.fog = new THREE.FogExp2( THEME.bg, 0.03 );

	const hemi = new THREE.HemisphereLight( 0x8fa6ad, 0x05070a, 0.5 );
	scene.add( hemi );

	const key = new THREE.DirectionalLight( 0xf2f7f8, 1.5 );
	key.position.set( 4, 8, 6 );
	scene.add( key );

	const fill = new THREE.DirectionalLight( 0x7f939c, 0.45 );
	fill.position.set( -6, 2, -4 );
	scene.add( fill );

	const rim = new THREE.PointLight( accent, 2.4, 30 );
	rim.position.set( -5, 3, -5 );
	scene.add( rim );

	return { hemi, key, fill, rim };

}

// A machined deck plate: a dark slab with a measurement grid on it. Replaces
// the old circular "floor + starfield" pairing.
export function createDeck( size = 16, { y = -1.6, divisions = 32 } = {} ) {

	const group = new THREE.Group();

	const plate = new THREE.Mesh(
		new THREE.PlaneGeometry( size, size ),
		new THREE.MeshStandardMaterial( { color: THEME.deck, metalness: 0.3, roughness: 0.85, transparent: true, opacity: 0.75 } ),
	);
	plate.rotation.x = -Math.PI / 2;
	plate.position.y = y;
	group.add( plate );

	const grid = new THREE.GridHelper( size, divisions, THEME.gridAccent, THEME.grid );
	grid.position.y = y + 0.005;
	grid.material.transparent = true;
	grid.material.opacity = 0.4;
	group.add( grid );

	return group;

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
