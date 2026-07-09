import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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

// A translucent slab used for transformer-block stages (RMSNorm, Attention,
// MLP, ...) stacked vertically.
export function createSlab( { width = 3, depth = 2, height = 0.22, color = 0x8b7bff, opacity = 0.55 } = {} ) {

	const geo = new THREE.BoxGeometry( width, height, depth );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.2, transparent: true, opacity } );
	return new THREE.Mesh( geo, mat );

}

// A grid of colored cells representing an attention-weight matrix.
export function createHeatmapPlane( values, { cols, cellSize = 0.32, gap = 0.04, baseColor = new THREE.Color( 0x35d0ba ) } = {} ) {

	const rows = Math.ceil( values.length / cols );
	const group = new THREE.Group();
	const step = cellSize + gap;

	values.forEach( ( v, i ) => {

		const r = Math.floor( i / cols );
		const c = i % cols;
		const geo = new THREE.BoxGeometry( cellSize, Math.max( 0.02, v * 0.6 ), cellSize );
		geo.translate( 0, Math.max( 0.02, v * 0.6 ) / 2, 0 );
		const color = baseColor.clone().multiplyScalar( 0.4 + v * 0.9 );
		const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: v * 0.9, roughness: 0.4, metalness: 0.2 } );
		const cell = new THREE.Mesh( geo, mat );
		cell.position.set( ( c - ( cols - 1 ) / 2 ) * step, 0, ( r - ( rows - 1 ) / 2 ) * step );
		cell.userData.value = v;
		group.add( cell );

	} );

	return group;

}

// A simple 3D bar (for logit / softmax bars), grows from its base.
export function createBarMesh( { width = 0.4, depth = 0.4, height = 1, color = 0x8b7bff } = {} ) {

	const geo = new THREE.BoxGeometry( width, Math.max( 0.001, height ), depth );
	geo.translate( 0, height / 2, 0 );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.25 } );
	return new THREE.Mesh( geo, mat );

}
