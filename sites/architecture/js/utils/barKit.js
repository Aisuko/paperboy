import * as THREE from 'three';
import { THEME } from './sceneKit.js';

export function signedBar( { thick = 0.3, depth = 0.3, axis = 'y', color = THEME.accent } = {} ) {

	const geo = axis === 'y' ? new THREE.BoxGeometry( thick, 1, depth ) : new THREE.BoxGeometry( 1, thick, depth );
	geo.translate( axis === 'y' ? 0 : 0.5, axis === 'y' ? 0.5 : 0, 0 );
	const mesh = new THREE.Mesh(
		geo,
		new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 } ),
	);
	mesh.userData.axis = axis;
	return mesh;

}

export function setSigned( mesh, v, scale = 1 ) {

	const len = Math.max( 0.012, Math.abs( v ) * scale );
	if ( mesh.userData.axis === 'y' ) mesh.scale.y = len;
	else mesh.scale.x = len;
	mesh.rotation.z = v < 0 ? Math.PI : 0;

}

export function tintBar( mesh, color, level = 0.6 ) {

	mesh.material.color.set( color );
	mesh.material.emissive.set( color );
	mesh.material.color.multiplyScalar( 0.3 + level * 0.8 );
	mesh.material.emissiveIntensity = 0.1 + level * 0.85;

}

export function barRow( n, { pitch = 0.46, axis = 'y', thick = 0.3, depth = 0.3, color = THEME.accent, along = 'x' } = {} ) {

	const group = new THREE.Group();
	const bars = [];

	for ( let i = 0; i < n; i ++ ) {

		const bar = signedBar( { thick, depth, axis, color } );
		const off = ( i - ( n - 1 ) / 2 ) * pitch;
		if ( along === 'x' ) bar.position.x = off;
		else bar.position.y = -off;
		bar.userData.index = i;
		group.add( bar );
		bars.push( bar );

	}

	group.userData = { bars, n, pitch, span: n * pitch };
	return group;

}

export function polyline( points, color, opacity = 0.95 ) {

	return new THREE.Line(
		new THREE.BufferGeometry().setFromPoints( points ),
		new THREE.LineBasicMaterial( { color, transparent: true, opacity } ),
	);

}
