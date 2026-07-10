import * as THREE from 'three';
import { GLOSSARY } from '../data/glossary.js';
import { addStandardLighting, createStarfield, createFloor, createOrbNode, createLabel } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';

const WORLD_NAMES = {
	tokenize: 'Tokenise & Embed',
	block: 'Transformer Block',
	attention: 'Self-Attention Deep-Dive',
	decode: 'lm_head -> Softmax',
	train: 'Train vs. Infer',
};

const RADIUS = 2.4;

export function buildGlossaryWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x35d0ba );
	scene.add( createStarfield() );
	scene.add( createFloor( 6, 0x0e1414 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const core = createOrbNode( { color: 0x35d0ba, radius: 0.22, emissiveIntensity: 1.2 } );
	rig.add( core );
	const coreLabel = createLabel( 'Glossary' );
	coreLabel.position.set( 0, 0.5, 0 );
	core.add( coreLabel );

	const nodes = [];
	const links = [];

	GLOSSARY.forEach( ( entry, i ) => {

		const angle = ( i / GLOSSARY.length ) * Math.PI * 2;
		const pos = new THREE.Vector3( Math.cos( angle ) * RADIUS, Math.sin( i * 1.7 ) * 0.4, Math.sin( angle ) * RADIUS );

		const orb = createOrbNode( { color: 0x8b7bff, radius: 0.2 } );
		orb.position.copy( pos );
		orb.userData.detail = {
			category: 'Glossary',
			name: entry.term,
			blurb: entry.blurb,
			description: `${ entry.description } See it in the "${ WORLD_NAMES[ entry.jump ] }" world.`,
		};
		const label = createLabel( entry.term, 'label2d label2d-dim' );
		label.position.set( 0, 0.32, 0 );
		orb.add( label );
		rig.add( orb );
		nodes.push( orb );

		links.push( new IPCLink( rig, pos.clone(), new THREE.Vector3( 0, 0, 0 ), 0x35d0ba, { particleCount: 2, speed: 0.3, radius: 0.016, arc: 0.25 } ) );

	} );

	let elapsed = 0;

	return {
		scene,
		interactables: nodes,
		defaultView: {
			position: new THREE.Vector3( 0, 2.6, 5.6 ),
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
