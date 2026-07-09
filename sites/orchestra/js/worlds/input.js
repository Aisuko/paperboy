import * as THREE from 'three';
import { TELEMETRY_FEATURES, EMBEDDING_DIM, jitterValue } from '../data/telemetry.js';
import { addStandardLighting, createStarfield, createFloor, createLabel } from '../utils/sceneKit.js';

export function buildInputWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x3b82f6 );
	scene.add( createStarfield() );
	scene.add( createFloor( 6, 0x0d1424 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	// Segmented battery pack: an outer shell + stacked charge segments.
	const shellGeo = new THREE.CylinderGeometry( 0.65, 0.65, 2.4, 24, 1, true );
	const shellMat = new THREE.MeshStandardMaterial( { color: 0x142038, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.55 } );
	const shell = new THREE.Mesh( shellGeo, shellMat );
	rig.add( shell );

	const segColors = [ 0x3b82f6, 0x3b82f6, 0x06b6d4, 0x06b6d4, 0x1c2740 ];
	const segments = [];
	segColors.forEach( ( color, i ) => {

		const geo = new THREE.CylinderGeometry( 0.5, 0.5, 0.38, 20 );
		const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: i < 3 ? 0.9 : 0.15, roughness: 0.4, metalness: 0.3 } );
		const seg = new THREE.Mesh( geo, mat );
		seg.position.y = -0.95 + i * 0.46;
		seg.userData.baseIntensity = i < 3 ? 0.9 : 0.15;
		rig.add( seg );
		segments.push( seg );

	} );

	const capGeo = new THREE.CylinderGeometry( 0.22, 0.22, 0.2, 16 );
	const capMat = new THREE.MeshStandardMaterial( { color: 0x3b82f6, roughness: 0.5 } );
	const cap = new THREE.Mesh( capGeo, capMat );
	cap.position.y = 1.3;
	rig.add( cap );

	// Feature readouts floating around the pack.
	const labels = TELEMETRY_FEATURES.map( ( feature, i ) => {

		const label = createLabel( `${ feature.label }: ${ jitterValue( feature ) }` );
		const angle = ( i / TELEMETRY_FEATURES.length ) * Math.PI * 2;
		label.position.set( Math.cos( angle ) * 1.9, 0.3 + ( i % 2 ) * 0.5, Math.sin( angle ) * 1.9 );
		rig.add( label );
		return { feature, label };

	} );

	const dimLabel = createLabel( `Transformer projection: ${ EMBEDDING_DIM }d`, 'label2d label2d-dim' );
	dimLabel.position.set( 0, -1.9, 0 );
	rig.add( dimLabel );

	rig.userData.detail = {
		category: 'Zone 01',
		name: 'Input Data',
		blurb: 'Battery telemetry streamed in and projected into a 768-dimensional feature space.',
		description: 'Cycle index, capacity, voltage and temperature are read off the pack every cycle and projected through a small transformer encoder before being handed to the agent council.',
	};

	let jitterElapsed = 0;

	return {
		scene,
		interactables: [ shell ],
		defaultView: {
			position: new THREE.Vector3( 0, 0.6, 4.4 ),
			target: new THREE.Vector3( 0, 0, 0 ),
		},
		update( dt ) {

			rig.rotation.y += dt * 0.12;
			jitterElapsed += dt;

			segments.forEach( ( seg, i ) => {

				const pulse = i < 3 ? Math.sin( jitterElapsed * 2 + i ) * 0.15 : 0;
				seg.material.emissiveIntensity = seg.userData.baseIntensity + pulse;

			} );

			if ( jitterElapsed > 2.2 ) {

				jitterElapsed = 0;
				labels.forEach( ( { feature, label } ) => {

					label.element.textContent = `${ feature.label }: ${ jitterValue( feature ) }`;

				} );

			}

		},
	};

}
