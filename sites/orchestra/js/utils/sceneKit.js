import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const THEME = {
	bg: 0x07090b,
	deck: 0x0c1113,
	grid: 0x1c262b,
	gridAccent: 0x2c4a48,
	accent: 0x4ec9b0,
	signal: 0xe8a33d,
	info: 0x6ea8fe,
	violet: 0xa78bfa,
	rose: 0xef8f6e,
	ink: 0xdfe6ea,
	muted: 0x38424a,
};

export function addStandardLighting( scene, accent = THEME.accent ) {

	scene.background = new THREE.Color( THEME.bg );
	scene.fog = new THREE.FogExp2( THEME.bg, 0.014 );

	scene.add( new THREE.HemisphereLight( 0x8fa6ad, 0x05070a, 0.5 ) );

	const key = new THREE.DirectionalLight( 0xf2f7f8, 1.4 );
	key.position.set( 4, 8, 10 );
	scene.add( key );

	const fill = new THREE.DirectionalLight( 0x7f939c, 0.4 );
	fill.position.set( -6, 2, -4 );
	scene.add( fill );

	const rim = new THREE.PointLight( accent, 1.6, 40 );
	rim.position.set( -6, 4, -6 );
	scene.add( rim );

}

export function createDeck( size = 60, { y = -4.2, divisions = 60 } = {} ) {

	const group = new THREE.Group();

	const plate = new THREE.Mesh(
		new THREE.PlaneGeometry( size, size ),
		new THREE.MeshStandardMaterial( { color: THEME.deck, metalness: 0.3, roughness: 0.85, transparent: true, opacity: 0.7 } ),
	);
	plate.rotation.x = -Math.PI / 2;
	plate.position.y = y;
	group.add( plate );

	const grid = new THREE.GridHelper( size, divisions, THEME.gridAccent, THEME.grid );
	grid.position.y = y + 0.005;
	grid.material.transparent = true;
	grid.material.opacity = 0.3;
	group.add( grid );

	return group;

}

export function createLabel( text, className = 'label2d' ) {

	const el = document.createElement( 'div' );
	el.className = className;
	el.textContent = text;
	return new CSS2DObject( el );

}
