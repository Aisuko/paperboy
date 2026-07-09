import * as THREE from 'three';
import { SOH_AGENTS, RUL_AGENTS, MODULES } from '../data/agents.js';
import { addStandardLighting, createStarfield, createFloor, createOrbNode, createBellCurveMesh, createLabel } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';

const SOH_COLOR = 0x3b82f6;
const RUL_COLOR = 0xa855f7;

const SOH_POSITIONS = [
	new THREE.Vector3( -2.6, 0.5, 0.6 ),
	new THREE.Vector3( -2.95, -0.1, -0.1 ),
	new THREE.Vector3( -2.5, 0.3, -0.8 ),
];

const RUL_POSITIONS = [
	new THREE.Vector3( 2.6, 0.5, 0.6 ),
	new THREE.Vector3( 2.95, -0.1, -0.1 ),
	new THREE.Vector3( 2.5, 0.3, -0.8 ),
];

function agentDetail( agent, category, color ) {

	return {
		category,
		name: agent.name,
		blurb: agent.blurb,
		description: '',
		metric: agent.estimate,
		metricLabel: 'Estimate',
		color,
	};

}

export function buildCouncilWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0xa855f7 );
	scene.add( createStarfield() );
	scene.add( createFloor( 6.5, 0x120f1e ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const bob = [];
	const links = [];

	// Consensus core.
	const core = createOrbNode( { color: 0x8b7bff, radius: 0.34, emissiveIntensity: 1.6 } );
	rig.add( core );
	const coreLabel = createLabel( 'Consensus core' );
	coreLabel.position.set( 0, 0.7, 0 );
	core.add( coreLabel );

	function addAgentOrb( agent, position, color, category ) {

		const orb = createOrbNode( { color, radius: 0.22 } );
		orb.position.copy( position );
		orb.userData.basePos = position.clone();
		orb.userData.phase = Math.random() * Math.PI * 2;
		orb.userData.detail = agentDetail( agent, category, color );

		const label = createLabel( agent.name, 'label2d label2d-dim' );
		label.position.set( 0, 0.32, 0 );
		orb.add( label );

		rig.add( orb );
		interactables.push( orb );
		bob.push( orb );
		links.push( new IPCLink( rig, position.clone(), new THREE.Vector3( 0, 0, 0 ), color, { particleCount: 2, speed: 0.4, radius: 0.02, arc: 0.5 } ) );

	}

	SOH_AGENTS.forEach( ( agent, i ) => addAgentOrb( agent, SOH_POSITIONS[ i ], SOH_COLOR, 'SOH Agent' ) );
	RUL_AGENTS.forEach( ( agent, i ) => addAgentOrb( agent, RUL_POSITIONS[ i ], RUL_COLOR, 'RUL Agent' ) );

	// Risk + Uncertainty modules as standalone monoliths, front/back of the core.
	const riskModule = MODULES.find( ( m ) => m.id === 'risk' );
	const uncModule = MODULES.find( ( m ) => m.id === 'uncertainty' );

	const riskGeo = new THREE.BoxGeometry( 0.4, 0.7, 0.12 );
	const riskMat = new THREE.MeshStandardMaterial( { color: riskModule.color, emissive: riskModule.color, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 } );
	const riskMesh = new THREE.Mesh( riskGeo, riskMat );
	riskMesh.position.set( 0, 0.35, 2.9 );
	riskMesh.userData.detail = { category: riskModule.category, name: riskModule.name, blurb: riskModule.blurb, description: riskModule.description, metric: riskModule.estimate, metricLabel: 'Risk level' };
	rig.add( riskMesh );
	interactables.push( riskMesh );
	links.push( new IPCLink( rig, riskMesh.position.clone(), new THREE.Vector3( 0, 0, 0 ), riskModule.color, { particleCount: 2, speed: 0.35, radius: 0.02, arc: 0.4 } ) );
	const riskLabel = createLabel( riskModule.name, 'label2d label2d-dim' );
	riskLabel.position.set( 0, 0.5, 0 );
	riskMesh.add( riskLabel );

	const uncMesh = createBellCurveMesh( { width: 1.4, depth: 0.6, sigma: 0.32, color: uncModule.color } );
	uncMesh.rotation.y = Math.PI;
	uncMesh.position.set( 0, 0.1, -2.7 );
	uncMesh.userData.detail = { category: uncModule.category, name: uncModule.name, blurb: uncModule.blurb, description: uncModule.description, metric: uncModule.estimate, metricLabel: 'Prediction interval' };
	rig.add( uncMesh );
	interactables.push( uncMesh );
	links.push( new IPCLink( rig, uncMesh.position.clone(), new THREE.Vector3( 0, 0, 0 ), uncModule.color, { particleCount: 2, speed: 0.35, radius: 0.02, arc: 0.4 } ) );
	const uncLabel = createLabel( uncModule.name, 'label2d label2d-dim' );
	uncLabel.position.set( 0, 0.7, 0 );
	uncMesh.add( uncLabel );

	let elapsed = 0;

	return {
		scene,
		interactables,
		defaultView: {
			position: new THREE.Vector3( 0, 2.6, 6.2 ),
			target: new THREE.Vector3( 0, 0.1, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			core.scale.setScalar( 1 + Math.sin( elapsed * 1.6 ) * 0.06 );
			bob.forEach( ( orb ) => {

				orb.position.y = orb.userData.basePos.y + Math.sin( elapsed * 1.4 + orb.userData.phase ) * 0.08;

			} );
			for ( const link of links ) link.update( dt );

		},
	};

}
