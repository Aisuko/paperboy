import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { tween, Easing } from './tween.js';

// Shared lighting rig + starfield + small geometry helpers so every world
// scene reads as part of the same "3D field guide" universe without
// repeating boilerplate per world.

export function addStandardLighting( scene, accent = 0x8b7bff ) {

	const hemi = new THREE.HemisphereLight( 0x8890ff, 0x0a0a10, 0.55 );
	scene.add( hemi );

	const key = new THREE.DirectionalLight( 0xffffff, 1.4 );
	key.position.set( 5, 8, 6 );
	scene.add( key );

	const rim = new THREE.PointLight( accent, 3.5, 40 );
	rim.position.set( -6, 3, -4 );
	scene.add( rim );

	scene.fog = new THREE.FogExp2( 0x05050a, 0.028 );

	return { hemi, key, rim };

}

export function createStarfield( count = 900, radius = 60 ) {

	const positions = new Float32Array( count * 3 );
	for ( let i = 0; i < count; i ++ ) {

		const r = radius * ( 0.4 + Math.random() * 0.6 );
		const theta = Math.random() * Math.PI * 2;
		const phi = Math.acos( 2 * Math.random() - 1 );
		positions[ i * 3 ] = r * Math.sin( phi ) * Math.cos( theta );
		positions[ i * 3 + 1 ] = Math.abs( r * Math.cos( phi ) ) * 0.5;
		positions[ i * 3 + 2 ] = r * Math.sin( phi ) * Math.sin( theta );

	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	const mat = new THREE.PointsMaterial( { color: 0x8890ff, size: 0.05, transparent: true, opacity: 0.5, sizeAttenuation: true } );
	return new THREE.Points( geo, mat );

}

export function createFloor( radius = 14, color = 0x11111a ) {

	const geo = new THREE.CircleGeometry( radius, 64 );
	const mat = new THREE.MeshStandardMaterial( { color, metalness: 0.4, roughness: 0.8, transparent: true, opacity: 0.55 } );
	const mesh = new THREE.Mesh( geo, mat );
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = -1.6;

	const grid = new THREE.GridHelper( radius * 2, 28, 0x8b7bff, 0x1a1a24 );
	grid.position.y = -1.59;
	grid.material.transparent = true;
	grid.material.opacity = 0.25;

	const group = new THREE.Group();
	group.add( mesh, grid );
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

// A small glowing chip/orb used for token nodes across worlds.
export function createOrbNode( { color = 0x8b7bff, radius = 0.22, emissiveIntensity = 1.4 } = {} ) {

	const geo = new THREE.SphereGeometry( radius, 24, 24 );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity, roughness: 0.35, metalness: 0.2 } );
	const mesh = new THREE.Mesh( geo, mat );

	const haloGeo = new THREE.SphereGeometry( radius * 1.8, 16, 16 );
	const haloMat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.14, depthWrite: false } );
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
