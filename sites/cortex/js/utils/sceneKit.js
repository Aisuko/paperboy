import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { tween, Easing } from './tween.js';

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

// A translucent slab used for transformer-block stages (LayerNorm, Attention,
// MLP, ...) stacked vertically.
export function createSlab( { width = 3, depth = 2, height = 0.22, color = 0x8b7bff, opacity = 0.55 } = {} ) {

	const geo = new THREE.BoxGeometry( width, height, depth );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.2, transparent: true, opacity } );
	return new THREE.Mesh( geo, mat );

}

// A grid of coloured cells representing an attention-weight matrix. Cell
// height is baked into geometry at a fixed `maxCellHeight` and the visible
// magnitude is driven by `scale.y` (same grow-from-base trick as
// createBarMesh), so `setHeatmapValues` can repaint a live heatmap (e.g. on
// attention-head switch) without rebuilding geometry.
export function createHeatmapPlane( values, { cols, cellSize = 0.32, gap = 0.04, baseColor = new THREE.Color( 0x35d0ba ), maxCellHeight = 0.6 } = {} ) {

	const rows = Math.ceil( values.length / cols );
	const group = new THREE.Group();
	const step = cellSize + gap;

	values.forEach( ( v, i ) => {

		const r = Math.floor( i / cols );
		const c = i % cols;
		const geo = new THREE.BoxGeometry( cellSize, maxCellHeight, cellSize );
		geo.translate( 0, maxCellHeight / 2, 0 );
		const color = baseColor.clone().multiplyScalar( 0.4 + v * 0.9 );
		const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: v * 0.9, roughness: 0.4, metalness: 0.2 } );
		const cell = new THREE.Mesh( geo, mat );
		cell.position.set( ( c - ( cols - 1 ) / 2 ) * step, 0, ( r - ( rows - 1 ) / 2 ) * step );
		cell.scale.y = Math.max( 0.02 / maxCellHeight, v );
		cell.userData.value = v;
		group.add( cell );

	} );

	group.userData.maxCellHeight = maxCellHeight;
	group.userData.baseColor = baseColor;
	return group;

}

// Tweens an existing createHeatmapPlane group to a new set of values in
// place — used by the attention world's head selector to repaint the
// heatmap without rebuilding geometry.
export function setHeatmapValues( group, values, { duration = 0.5 } = {} ) {

	const maxH = group.userData.maxCellHeight;
	const baseColor = group.userData.baseColor;

	group.children.forEach( ( cell, i ) => {

		const v = values[ i ];
		if ( v === undefined ) return;

		const fromScale = cell.scale.y;
		const toScale = Math.max( 0.02 / maxH, v );
		const fromColor = cell.material.color.clone();
		const toColor = baseColor.clone().multiplyScalar( 0.4 + v * 0.9 );
		const fromEmissive = cell.material.emissiveIntensity;
		const toEmissive = v * 0.9;

		tween( duration, ( t ) => {

			cell.scale.y = THREE.MathUtils.lerp( fromScale, toScale, t );
			cell.material.color.copy( fromColor ).lerp( toColor, t );
			cell.material.emissive.copy( cell.material.color );
			cell.material.emissiveIntensity = THREE.MathUtils.lerp( fromEmissive, toEmissive, t );

		}, { easing: Easing.cubicInOut } );

		cell.userData.value = v;

	} );

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

// A small labelled 3-axis frame + faint base grid, used as a "you are
// looking at a projection" legend next to a point cloud that actually lives
// in a much higher-dimensional space (e.g. token embeddings projected from
// 768d down to 3d on 01 Tokenise).
export function createAxisFrame( { size = 2, labels = [ 'dim 1', 'dim 2', 'dim 3' ] } = {} ) {

	const group = new THREE.Group();
	const axes = [
		{ dir: new THREE.Vector3( 1, 0, 0 ), color: 0xff5da2 },
		{ dir: new THREE.Vector3( 0, 1, 0 ), color: 0x35d0ba },
		{ dir: new THREE.Vector3( 0, 0, 1 ), color: 0x8b7bff },
	];

	axes.forEach( ( axis, i ) => {

		const geo = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3(), axis.dir.clone().multiplyScalar( size ) ] );
		const mat = new THREE.LineBasicMaterial( { color: axis.color, transparent: true, opacity: 0.5 } );
		group.add( new THREE.Line( geo, mat ) );

		const label = createLabel( labels[ i ], 'label2d label2d-dim' );
		label.position.copy( axis.dir.clone().multiplyScalar( size * 1.08 ) );
		group.add( label );

	} );

	const grid = new THREE.GridHelper( size * 1.8, 8, 0x8b7bff, 0x1a1a24 );
	grid.material.transparent = true;
	grid.material.opacity = 0.14;
	group.add( grid );

	return group;

}

// The theme has no starfield any more. Worlds still import this, so it returns
// an empty group rather than forcing an edit at every call site.
export function createStarfield() {

	return new THREE.Group();

}
