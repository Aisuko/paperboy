import * as THREE from 'three';

// Shared lighting rig + starfield so every world scene reads as part of the
// same "VR HUD" universe without repeating boilerplate per world.

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

// Disposes a component/label group built by createComponentObject (or any
// THREE.Group of meshes/CSS2DObjects) and detaches it from its parent.
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

// Disposes an IPCLink's tube + particle meshes and detaches them.
export function disposeLink( link ) {

	link.dispose();
	if ( link.tube.parent ) link.tube.parent.remove( link.tube );
	link.particles.forEach( ( p ) => { if ( p.parent ) p.parent.remove( p ); } );

}

export function createFloor( radius = 14, color = 0x11111a ) {

	const geo = new THREE.CircleGeometry( radius, 64 );
	const mat = new THREE.MeshStandardMaterial( { color, metalness: 0.4, roughness: 0.8, transparent: true, opacity: 0.55 } );
	const mesh = new THREE.Mesh( geo, mat );
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = -1.6;
	mesh.receiveShadow = false;

	const grid = new THREE.GridHelper( radius * 2, 28, 0x8b7bff, 0x1a1a24 );
	grid.position.y = -1.59;
	grid.material.transparent = true;
	grid.material.opacity = 0.25;

	const group = new THREE.Group();
	group.add( mesh, grid );
	return group;

}
