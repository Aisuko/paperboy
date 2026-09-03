import * as THREE from 'three';
import { THEME } from './sceneKit.js';

export function cellMesh( cell, depth, color = 0x223034 ) {

	return new THREE.Mesh(
		new THREE.BoxGeometry( cell, cell, depth ),
		new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.2, roughness: 0.45, metalness: 0.2 } ),
	);

}

export function paintCell( mesh, color, level = 0.5 ) {

	mesh.material.color.set( color );
	mesh.material.emissive.set( color );
	mesh.material.color.multiplyScalar( 0.25 + level * 0.9 );
	mesh.material.emissiveIntensity = 0.05 + level * 0.85;

}

export function createStrip( { count = 8, cell = 0.32, gap = 0.07, depth = 0.32, axis = 'x' } = {} ) {

	const group = new THREE.Group();
	const step = cell + gap;
	const cells = [];

	for ( let i = 0; i < count; i ++ ) {

		const mesh = cellMesh( cell, depth );
		const offset = ( i - ( count - 1 ) / 2 ) * step;
		if ( axis === 'x' ) mesh.position.x = offset;
		else if ( axis === 'y' ) mesh.position.y = -offset;
		else mesh.position.z = offset;
		mesh.userData.index = i;
		group.add( mesh );
		cells.push( mesh );

	}

	group.userData = { cells, count, step, cell, length: count * step };
	return group;

}

export function createWall( { rows = 6, cols = 8, cell = 0.32, gap = 0.07, depth = 0.32 } = {} ) {

	const group = new THREE.Group();
	const step = cell + gap;
	const cells = [];

	for ( let r = 0; r < rows; r ++ ) {

		for ( let c = 0; c < cols; c ++ ) {

			const mesh = cellMesh( cell, depth );
			mesh.position.set( ( c - ( cols - 1 ) / 2 ) * step, ( ( rows - 1 ) / 2 - r ) * step, 0 );
			mesh.userData.row = r;
			mesh.userData.col = c;
			mesh.userData.index = r * cols + c;
			group.add( mesh );
			cells.push( mesh );

		}

	}

	group.userData = { cells, rows, cols, step, cell, width: cols * step, height: rows * step };
	return group;

}

export function cellAt( wall, row, col ) {

	return wall.userData.cells[ row * wall.userData.cols + col ];

}

export function createBar( { width = 0.6, depth = 0.6, color = THEME.accent } = {} ) {

	const geo = new THREE.BoxGeometry( width, 1, depth );
	geo.translate( 0, 0.5, 0 );
	const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.2 } );
	return new THREE.Mesh( geo, mat );

}

export function setBar( mesh, height ) {

	mesh.scale.y = Math.max( 0.001, height );

}

export function createFrame( width, height, { color = THEME.ink, opacity = 0.18 } = {} ) {

	return new THREE.LineSegments(
		new THREE.EdgesGeometry( new THREE.PlaneGeometry( width, height ) ),
		new THREE.LineBasicMaterial( { color, transparent: true, opacity } ),
	);

}

export function createRail( from, to, { color = THEME.muted, radius = 0.035, opacity = 0.7 } = {} ) {

	const dir = new THREE.Vector3().subVectors( to, from );
	const mesh = new THREE.Mesh(
		new THREE.CylinderGeometry( radius, radius, dir.length(), 8 ),
		new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity } ),
	);
	mesh.position.copy( from ).add( to ).multiplyScalar( 0.5 );
	mesh.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 1, 0 ), dir.clone().normalize() );
	return mesh;

}
