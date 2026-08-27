import * as THREE from 'three';
import { GLOSSARY } from '../data/glossary.js';
import { addStandardLighting, createDeck, createOrbNode, createLabel, THEME } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';

const WORLD_NAMES = {
	tokenize: '01 Tokenise',
	block: '02 Block',
	attention: '03 Attention',
	output: '04 Output',
	train: '05 Train vs infer',
};

const RADIUS = 3.2;

export function buildGlossaryWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 20, { y: -2.2, divisions: 40 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const core = createOrbNode( { color: THEME.accent, radius: 0.22, emissiveIntensity: 1.2 } );
	rig.add( core );
	const coreLabel = createLabel( 'Glossary', 'label2d label2d-key' );
	coreLabel.position.set( 0, 0.5, 0 );
	core.add( coreLabel );

	const nodes = [];
	const links = [];

	GLOSSARY.forEach( ( entry, i ) => {

		const angle = ( i / GLOSSARY.length ) * Math.PI * 2;
		const pos = new THREE.Vector3( Math.cos( angle ) * RADIUS, Math.sin( i * 1.7 ) * 0.4, Math.sin( angle ) * RADIUS );

		const orb = createOrbNode( { color: THEME.info, radius: 0.18 } );
		orb.position.copy( pos );
		orb.userData.detail = {
			category: 'Glossary',
			name: entry.term,
			blurb: entry.blurb,
			description: `${ entry.description }\n\nSee it on ${ WORLD_NAMES[ entry.jump ] }.`,
		};
		const label = createLabel( entry.term, 'label2d label2d-dim' );
		label.position.set( 0, 0.32, 0 );
		orb.add( label );
		rig.add( orb );
		nodes.push( orb );

		links.push( new IPCLink( rig, pos.clone(), new THREE.Vector3( 0, 0, 0 ), THEME.accent, { particleCount: 2, speed: 0.3, radius: 0.014, arc: 0.25 } ) );

	} );

	let elapsed = 0;

	return {
		scene,
		interactables: nodes,
		defaultView: {
			position: new THREE.Vector3( 0, 4.6, 12.4 ),
			target: new THREE.Vector3( 0, 0, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			rig.rotation.y += dt * 0.06;
			core.scale.setScalar( 1 + Math.sin( elapsed * 1.4 ) * 0.05 );
			for ( const link of links ) link.update( dt );

		},
	};

}
