import * as THREE from 'three';
import { TELEMETRY_FEATURES, EMBEDDING_DIM, NOMINAL_CAPACITY, jitterValue } from '../data/telemetry.js';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';

export function buildInputWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 22, { y: -2.0, divisions: 44 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	// Segmented battery pack: an outer shell + stacked charge segments.
	const shellGeo = new THREE.CylinderGeometry( 0.65, 0.65, 2.4, 24, 1, true );
	const shellMat = new THREE.MeshStandardMaterial( { color: 0x131b20, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.5 } );
	const shell = new THREE.Mesh( shellGeo, shellMat );
	rig.add( shell );

	// Four lit segments out of five: the pack is at roughly 94% of nominal.
	const segColors = [ THEME.info, THEME.info, THEME.accent, THEME.accent, THEME.muted ];
	const segments = [];
	segColors.forEach( ( color, i ) => {

		const geo = new THREE.CylinderGeometry( 0.5, 0.5, 0.38, 20 );
		const mat = new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: i < 4 ? 0.55 : 0.12, roughness: 0.4, metalness: 0.3 } );
		const seg = new THREE.Mesh( geo, mat );
		seg.position.y = -0.95 + i * 0.46;
		seg.userData.baseIntensity = i < 4 ? 0.55 : 0.12;
		rig.add( seg );
		segments.push( seg );

	} );

	const capGeo = new THREE.CylinderGeometry( 0.22, 0.22, 0.2, 16 );
	const capMat = new THREE.MeshStandardMaterial( { color: THEME.info, emissive: THEME.info, emissiveIntensity: 0.25, roughness: 0.5 } );
	const cap = new THREE.Mesh( capGeo, capMat );
	cap.position.y = 1.3;
	rig.add( cap );

	// Feature readouts floating around the pack.
	const labels = TELEMETRY_FEATURES.map( ( feature, i ) => {

		const label = createLabel( `${ feature.label }  ${ jitterValue( feature ) }`, 'label2d label2d-dim' );
		const angle = ( i / TELEMETRY_FEATURES.length ) * Math.PI * 2;
		label.position.set( Math.cos( angle ) * 2.3, 1.0 - i * 0.4, Math.sin( angle ) * 2.3 );
		rig.add( label );
		return { feature, label };

	} );

	const dimLabel = createLabel( `${ TELEMETRY_FEATURES.length } features → ${ EMBEDDING_DIM }-d encoder projection`, 'label2d label2d-dim' );
	dimLabel.position.set( 0, -2.1, 0 );
	rig.add( dimLabel );

	shell.userData.detail = {
		category: 'Zone 01',
		name: 'Input data',
		blurb: `${ TELEMETRY_FEATURES.length } measured features per cycle, projected into a ${ EMBEDDING_DIM }-dimensional encoding.`,
		description: `Capacity, voltage, current, temperature and DC resistance are read off the pack every cycle. Capacity against a ${ NOMINAL_CAPACITY } Ah nominal is what the state-of-health agents work from; resistance growth and the dQ/dV curve are what the others use.`,
		metric: `${ TELEMETRY_FEATURES.length } → ${ EMBEDDING_DIM }`,
		metricLabel: 'Feature projection',
	};

	let jitterElapsed = 0;

	return {
		scene,
		interactables: [ shell ],
		defaultView: {
			position: new THREE.Vector3( -0.4, 1.4, 12.0 ),
			target: new THREE.Vector3( -0.4, -0.1, 0 ),
		},
		features: labels,
		update( dt ) {

			rig.rotation.y += dt * 0.12;
			jitterElapsed += dt;

			segments.forEach( ( seg, i ) => {

				const pulse = i < 4 ? Math.sin( jitterElapsed * 2 + i ) * 0.1 : 0;
				seg.material.emissiveIntensity = seg.userData.baseIntensity + pulse;

			} );

			if ( jitterElapsed > 2.2 ) {

				jitterElapsed = 0;
				labels.forEach( ( { feature, label } ) => {

					label.element.textContent = `${ feature.label }  ${ jitterValue( feature ) }`;

				} );

			}

		},
	};

}
