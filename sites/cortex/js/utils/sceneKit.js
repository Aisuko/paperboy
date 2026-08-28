import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Shared scene furniture for the "instrument console" theme. Matches the
// Hurd guide's kit so the two exhibits read as one product: a neutral studio
// rig and a machined deck plate, no starfield.

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
	scene.fog = new THREE.FogExp2( THEME.bg, 0.022 );

	const hemi = new THREE.HemisphereLight( 0x8fa6ad, 0x05070a, 0.5 );
	scene.add( hemi );

	const key = new THREE.DirectionalLight( 0xf2f7f8, 1.5 );
	key.position.set( 4, 8, 6 );
	scene.add( key );

	const fill = new THREE.DirectionalLight( 0x7f939c, 0.45 );
	fill.position.set( -6, 2, -4 );
	scene.add( fill );

	const rim = new THREE.PointLight( accent, 2.0, 30 );
	rim.position.set( -5, 3, -5 );
	scene.add( rim );

	return { hemi, key, fill, rim };

}

// A machined deck plate with a measurement grid on it.
export function createDeck( size = 16, { y = -1.6, divisions = 32 } = {} ) {

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
	grid.material.opacity = 0.35;
	group.add( grid );

	return group;

}

// Kept under its old name so existing worlds keep working; the circular floor
// is now the same deck plate everything else stands on.
export function createFloor( radius = 14, _color = THEME.deck ) {

	return createDeck( radius * 2, { y: -1.6, divisions: Math.round( radius * 3 ) } );

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

// A small glowing chip/orb used for token nodes across worlds.
export function createOrbNode( { color = THEME.info, radius = 0.22, emissiveIntensity = 0.8 } = {} ) {

	const geo = new THREE.SphereGeometry( radius, 24, 24 );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity, roughness: 0.35, metalness: 0.2 } );
	const mesh = new THREE.Mesh( geo, mat );

	const haloGeo = new THREE.SphereGeometry( radius * 1.6, 16, 16 );
	const haloMat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.07, depthWrite: false } );
	mesh.add( new THREE.Mesh( haloGeo, haloMat ) );

	return mesh;

}

export function createLabel( text, className = 'label2d' ) {

	const el = document.createElement( 'div' );
	el.className = className;
	el.textContent = text;
	return new CSS2DObject( el );

}


// A simple 3D bar (for logit / softmax bars), grows from its base.
export function createBarMesh( { width = 0.4, depth = 0.4, height = 1, color = 0x8b7bff } = {} ) {

	const geo = new THREE.BoxGeometry( width, Math.max( 0.001, height ), depth );
	geo.translate( 0, height / 2, 0 );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.25 } );
	return new THREE.Mesh( geo, mat );

}

// An S-shaped logistic squashing curve (illustrative — real softmax is
// computed jointly over the whole vocabulary; this single-input curve is a
// visual stand-in for "squash into (0, 1)", matching the classic softmax/
// sigmoid textbook plot) used on 04 Decode. `softmaxCurvePoint` finds the
// world position where a given probability actually sits on the curve, so
// probability markers land precisely on the line instead of just near it.
export function createSoftmaxCurve( { domain = 6, width = 6, height = 2.2, baseY = -1.1, color = 0x8b7bff, segments = 48 } = {} ) {

	const points = [];
	for ( let i = 0; i <= segments; i ++ ) {

		const xd = -domain + ( i / segments ) * domain * 2;
		const y = 1 / ( 1 + Math.exp( -xd ) );
		points.push( new THREE.Vector3( ( xd / domain ) * ( width / 2 ), baseY + y * height, 0 ) );

	}

	const curve = new THREE.CatmullRomCurve3( points );
	const geo = new THREE.TubeGeometry( curve, segments, 0.035, 8, false );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 1 } );
	const mesh = new THREE.Mesh( geo, mat );
	mesh.userData = { domain, width, height, baseY };
	return mesh;

}

export function softmaxCurvePoint( curveMesh, prob ) {

	const { domain, width, height, baseY } = curveMesh.userData;
	const p = THREE.MathUtils.clamp( prob, 0.0005, 0.9995 );
	const xd = THREE.MathUtils.clamp( Math.log( p / ( 1 - p ) ), -domain, domain );
	return new THREE.Vector3( ( xd / domain ) * ( width / 2 ), baseY + p * height, 0 );

}


// The theme has no starfield any more. Worlds still import this, so it returns
// an empty group rather than forcing an edit at every call site.
export function createStarfield() {

	return new THREE.Group();

}
