import * as THREE from 'three';
import { SOH_AGENTS, RUL_AGENTS, MODULES, assess } from '../data/council.js';
import { addStandardLighting, createDeck, createOrbNode, createBellCurveMesh, createLabel, THEME } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';

// 03 · Who does the estimating. Two groups of three agents flank a consensus
// core, with the risk and uncertainty modules front and back. Orb size tracks
// each agent's confidence — a wide error bar makes for a smaller orb, which is
// literally how much pull it has on the answer.

const SOH_COLOR = THEME.info;
const RUL_COLOR = THEME.violet;

const SOH_POSITIONS = [
	new THREE.Vector3( -3.1, 0.55, 0.7 ),
	new THREE.Vector3( -3.5, -0.05, -0.15 ),
	new THREE.Vector3( -2.9, 0.3, -1.0 ),
];

const RUL_POSITIONS = [
	new THREE.Vector3( 3.1, 0.55, 0.7 ),
	new THREE.Vector3( 3.5, -0.05, -0.15 ),
	new THREE.Vector3( 2.9, 0.3, -1.0 ),
];

export function buildCouncilWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 26, { y: -2.0, divisions: 52 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const result = assess();

	const interactables = [];
	const bob = [];
	const links = [];

	// Consensus core.
	const core = createOrbNode( { color: THEME.accent, radius: 0.3, emissiveIntensity: 1.0 } );
	rig.add( core );
	const coreLabel = createLabel( 'consensus core', 'label2d label2d-key' );
	coreLabel.position.set( 0, 0.62, 0 );
	core.add( coreLabel );
	const coreValue = createLabel(
		`SOH ${ result.soh.value.toFixed( 2 ) }%  ·  RUL ${ Math.round( result.rul.value ) } cyc`,
		'label2d label2d-dim',
	);
	coreValue.position.set( 0, -0.82, 0 );
	core.add( coreValue );

	core.userData.detail = {
		category: 'Consensus',
		name: 'Inverse-variance weighted mean',
		blurb: `SOH ${ result.soh.value.toFixed( 2 )
		} ± ${ result.soh.sigma.toFixed( 2 ) }%  ·  RUL ${ Math.round( result.rul.value )
		} ± ${ Math.round( result.rul.sigma ) } cyc`,
		description: 'Each agent is weighted by 1/σ², so the consensus is pulled hardest by whichever member is most confident. The combined σ is always tighter than any single agent\'s — that is the mathematical case for a council.',
	};
	interactables.push( core );

	function addAgentOrb( agent, position, color, category, weight ) {

		// Confidence sets the size: weight is the agent's share of the total.
		const radius = 0.15 + weight * 0.34;
		const orb = createOrbNode( { color, radius } );
		orb.position.copy( position );
		orb.userData.basePos = position.clone();
		orb.userData.phase = position.x + position.z;
		orb.userData.detail = {
			category,
			name: agent.name,
			blurb: agent.blurb,
			description: `Reported ${ agent.estimate }${ agent.unit } with σ ${ agent.sigma }${ agent.unit.trim() ? agent.unit : '' }, giving it ${ ( weight * 100 ).toFixed( 1 ) }% of the weight in the consensus.`,
			metric: `${ agent.estimate }${ agent.unit }  ± ${ agent.sigma }`,
			metricLabel: 'Estimate ± σ',
			color,
		};

		const label = createLabel( `${ agent.name.replace( ' Agent', '' ) }  ${ agent.estimate }${ agent.unit }`, 'label2d label2d-dim' );
		label.position.set( 0, radius + 0.18, 0 );
		orb.add( label );

		rig.add( orb );
		interactables.push( orb );
		bob.push( orb );
		links.push( new IPCLink( rig, position.clone(), new THREE.Vector3( 0, 0, 0 ), color, {
			// Link speed carries the same information as orb size: a heavily
			// weighted agent sends its vote through faster.
			particleCount: 2, speed: 0.25 + weight * 0.5, radius: 0.016, arc: 0.5,
		} ) );

	}

	SOH_AGENTS.forEach( ( agent, i ) => addAgentOrb( agent, SOH_POSITIONS[ i ], SOH_COLOR, 'SOH agent', result.soh.weights[ i ] ) );
	RUL_AGENTS.forEach( ( agent, i ) => addAgentOrb( agent, RUL_POSITIONS[ i ], RUL_COLOR, 'RUL agent', result.rul.weights[ i ] ) );

	const groupLabels = [
		[ 'state of health', -3.2, SOH_COLOR ],
		[ 'remaining useful life', 3.2, RUL_COLOR ],
	];
	groupLabels.forEach( ( [ text, x, color ] ) => {

		const label = createLabel( text, 'label2d label2d-dim' );
		label.element.style.color = '#' + color.toString( 16 ).padStart( 6, '0' );
		label.position.set( x, 1.7, 0 );
		rig.add( label );

	} );

	// Risk module: an upright meter whose lit fraction is the risk index.
	const riskModule = MODULES.find( ( m ) => m.id === 'risk' );
	const riskHeight = 1.0;
	const riskBody = new THREE.Mesh(
		new THREE.BoxGeometry( 0.34, riskHeight, 0.14 ),
		new THREE.MeshStandardMaterial( { color: 0x11171b, emissive: THEME.muted, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.8 } ),
	);
	riskBody.position.set( 1.5, -0.05, 3.0 );
	rig.add( riskBody );

	const riskFill = new THREE.Mesh(
		new THREE.BoxGeometry( 0.22, riskHeight * ( result.risk.index / 100 ), 0.08 ),
		new THREE.MeshStandardMaterial( { color: result.risk.color, emissive: result.risk.color, emissiveIntensity: 0.7, roughness: 0.4 } ),
	);
	riskFill.position.set( 1.5, -0.05 - riskHeight / 2 + ( riskHeight * ( result.risk.index / 100 ) ) / 2, 3.08 );
	rig.add( riskFill );

	riskBody.userData.detail = {
		category: riskModule.category,
		name: riskModule.name,
		blurb: riskModule.blurb,
		description: riskModule.description,
		metric: `${ result.risk.label } (${ result.risk.index.toFixed( 1 ) } / 100)`,
		metricLabel: 'Risk index',
		color: riskModule.color,
	};
	interactables.push( riskBody );

	const riskLabel = createLabel( `risk ${ result.risk.label.toLowerCase() } · ${ result.risk.index.toFixed( 0 ) }/100`, 'label2d label2d-dim' );
	riskLabel.position.set( 0, -0.62, 0 );
	riskBody.add( riskLabel );

	links.push( new IPCLink( rig, riskBody.position.clone(), new THREE.Vector3( 0, 0, 0 ), riskModule.color, {
		particleCount: 2, speed: 0.3, radius: 0.018, arc: 0.4,
	} ) );

	// Uncertainty module: the consensus distribution, drawn to its real σ.
	const uncModule = MODULES.find( ( m ) => m.id === 'uncertainty' );
	const uncMesh = createBellCurveMesh( { width: 1.6, depth: 0.65, sigma: 0.3, color: uncModule.color } );
	uncMesh.rotation.y = Math.PI;
	uncMesh.position.set( -1.5, 0.15, -3.2 );
	uncMesh.userData.detail = {
		category: uncModule.category,
		name: uncModule.name,
		blurb: uncModule.blurb,
		description: uncModule.description,
		metric: `± ${ result.soh.sigma.toFixed( 2 ) }%  ·  ± ${ Math.round( result.rul.sigma ) } cyc`,
		metricLabel: 'Combined σ',
		color: uncModule.color,
	};
	rig.add( uncMesh );
	interactables.push( uncMesh );

	const uncLabel = createLabel( `σ ± ${ result.soh.sigma.toFixed( 2 ) }%`, 'label2d label2d-dim' );
	uncLabel.position.set( 0, 0.68, 0 );
	uncMesh.add( uncLabel );

	links.push( new IPCLink( rig, uncMesh.position.clone(), new THREE.Vector3( 0, 0, 0 ), uncModule.color, {
		particleCount: 2, speed: 0.3, radius: 0.018, arc: 0.4,
	} ) );

	let elapsed = 0;

	return {
		scene,
		interactables,
		result,
		defaultView: {
			position: new THREE.Vector3( -0.4, 5.6, 19.0 ),
			target: new THREE.Vector3( -0.4, 0.1, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			core.scale.setScalar( 1 + Math.sin( elapsed * 1.6 ) * 0.05 );
			bob.forEach( ( orb ) => {

				orb.position.y = orb.userData.basePos.y + Math.sin( elapsed * 1.3 + orb.userData.phase ) * 0.06;

			} );
			for ( const link of links ) link.update( dt );

		},
	};

}
