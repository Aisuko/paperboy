import * as THREE from 'three';
import { ZONES } from '../data/zones.js';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';

export const ZONE_SPACING = 4.2;

export function zoneX( index ) {

	const offset = ( ( ZONES.length - 1 ) * ZONE_SPACING ) / 2;
	return index * ZONE_SPACING - offset;

}

function createZoneIcon( key, color ) {

	const group = new THREE.Group();

	if ( key === 'input' ) {

		const geo = new THREE.BoxGeometry( 0.55, 0.9, 0.32 );
		const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3 } );
		group.add( new THREE.Mesh( geo, mat ) );

	} else if ( key === 'council' ) {

		const centerGeo = new THREE.SphereGeometry( 0.22, 20, 20 );
		const centerMat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.8, roughness: 0.3 } );
		group.add( new THREE.Mesh( centerGeo, centerMat ) );

		for ( let i = 0; i < 4; i ++ ) {

			const angle = ( i / 4 ) * Math.PI * 2;
			const orbGeo = new THREE.SphereGeometry( 0.11, 14, 14 );
			const orbMat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 1.1, roughness: 0.3 } );
			const orb = new THREE.Mesh( orbGeo, orbMat );
			orb.position.set( Math.cos( angle ) * 0.55, 0, Math.sin( angle ) * 0.55 );
			group.add( orb );

		}

	} else if ( key === 'aggregation' ) {

		for ( let i = 0; i < 3; i ++ ) {

			const geo = new THREE.TorusGeometry( 0.32 - i * 0.06, 0.03, 10, 28 );
			const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.7, roughness: 0.35 } );
			const ring = new THREE.Mesh( geo, mat );
			ring.position.y = i * 0.22 - 0.22;
			ring.rotation.x = Math.PI / 2;
			group.add( ring );

		}

	} else {

		const geo = new THREE.TorusGeometry( 0.34, 0.06, 12, 40, Math.PI * 1.5 );
		const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 } );
		const ring = new THREE.Mesh( geo, mat );
		ring.rotation.z = Math.PI * 0.75;
		group.add( ring );

	}

	group.position.y = 0.55;
	return group;

}

export function buildOverviewWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 40, { y: -1.75, divisions: 80 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const spinning = [];
	const links = [];
	let prevPos = null;

	ZONES.forEach( ( zone, i ) => {

		const platform = new THREE.Group();
		const x = zoneX( i );
		platform.position.set( x, -1.6, 0 );

		const floorGeo = new THREE.CylinderGeometry( 1.15, 1.25, 0.12, 32 );
		const floorMat = new THREE.MeshStandardMaterial( { color: zone.color, emissive: zone.color, emissiveIntensity: 0.25, roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.85 } );
		platform.add( new THREE.Mesh( floorGeo, floorMat ) );

		const icon = createZoneIcon( zone.key, zone.color );
		platform.add( icon );
		spinning.push( icon );

		const label = createLabel( `${ zone.index } · ${ zone.label }`, 'label2d label2d-key' );
		label.position.set( 0, 1.65, 0 );
		platform.add( label );

		platform.userData.detail = {
			category: `Zone ${ zone.index }`,
			name: zone.label,
			blurb: zone.blurb,
			description: '',
		};

		rig.add( platform );
		interactables.push( platform );

		const pos = new THREE.Vector3( x, -1.5, 0 );
		if ( prevPos ) {

			links.push( new IPCLink( rig, prevPos, pos, zone.color, { particleCount: 4, speed: 0.3, radius: 0.03, arc: 0.4 } ) );

		}
		prevPos = pos;

	} );

	let elapsed = 0;

	return {
		scene,
		interactables,
		defaultView: {
			position: new THREE.Vector3( -0.9, 4.6, 28.0 ),
			target: new THREE.Vector3( -0.9, -0.9, 0 ),
		},
		legendZones: ZONES,
		update( dt ) {

			elapsed += dt;
			for ( const icon of spinning ) icon.rotation.y += dt * 0.4;
			for ( const link of links ) link.update( dt );

		},
	};

}
