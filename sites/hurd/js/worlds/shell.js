import * as THREE from 'three';
import { CATEGORIES } from '../data/components.js';
import { createComponentObject, setNodeState, animateComponent } from '../components3d.js';
import { addStandardLighting, createLabel, disposeLink } from '../utils/sceneKit.js';
import { buildSystemMap, USER_Y } from '../utils/systemMap.js';
import { IPCLink } from '../utils/ipcLink.js';

// 05 · Run a command. The same machine again, with a shell process hovering
// above it. Running a command draws the actual hop path — bash to proc to exec
// to auth to ext2fs to term — as directed IPC links over the resting map, so
// you can see one syscall's worth of message passing cross the whole system.

const BASH_POS = new THREE.Vector3( 0, USER_Y + 2.2, 1.1 );

export function buildShellWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );

	const map = buildSystemMap( scene, { linkOpacity: 0.07 } );
	map.resetStates( 'done' );

	// bash is not a Hurd server — it is an ordinary process, drawn as a small
	// coupler above the rack.
	const bash = createComponentObject( { id: 'bash', name: 'bash', category: 'core', shape: 'module' } );
	bash.position.copy( BASH_POS );
	map.group.add( bash );
	const bashLabel = createLabel( 'bash · pid 47', 'label2d label2d-key' );
	bashLabel.position.set( 0, 0.5, 0 );
	bash.add( bashLabel );

	function positionOf( componentId ) {

		return componentId === 'bash' ? BASH_POS.clone() : map.positionOf( componentId );

	}

	function nodeOf( componentId ) {

		return componentId === 'bash' ? bash : map.get( componentId );

	}

	let hopLinks = [];
	let steps = [];
	let currentIndex = 0;

	function clearHops() {

		hopLinks.forEach( ( l ) => disposeLink( l ) );
		hopLinks = [];

	}

	function reset() {

		clearHops();
		steps = [];
		currentIndex = 0;
		map.resetStates( 'done' );
		setNodeState( bash, 'active' );

	}

	function runCommand( commandSteps ) {

		clearHops();
		steps = commandSteps;
		currentIndex = 0;
		map.resetStates( 'done' );

		// One directed link per hop, dark until the trace reaches it.
		for ( let i = 1; i < steps.length; i ++ ) {

			const from = positionOf( steps[ i - 1 ].componentId );
			const to = positionOf( steps[ i ].componentId );
			const comp = steps[ i ].componentId;
			const color = CATEGORIES[ map.get( comp )?.userData.category ]?.color ?? 0x4ec9b0;

			const link = new IPCLink( map.group, from, to, color, {
				particleCount: 2, speed: 0.55, radius: 0.016, arc: 0.75, tubeOpacity: 0.16,
			} );
			link.setActive( false );
			hopLinks.push( link );

		}

		goToStep( 0 );

	}

	function goToStep( index ) {

		if ( ! steps.length ) return;
		currentIndex = Math.max( 0, Math.min( steps.length - 1, index ) );

		map.nodes.forEach( ( n ) => setNodeState( n, 'done' ) );
		setNodeState( bash, 'done' );

		steps.forEach( ( step, i ) => {

			const node = nodeOf( step.componentId );
			if ( ! node ) return;
			if ( i === currentIndex ) setNodeState( node, 'active' );

		} );

		hopLinks.forEach( ( link, i ) => link.setActive( i < currentIndex ) );

	}

	reset();

	function getStepView( index ) {

		if ( ! steps.length ) return this.defaultView;
		const node = nodeOf( steps[ Math.max( 0, Math.min( steps.length - 1, index ) ) ].componentId );
		const p = node ? node.position : new THREE.Vector3();
		return {
			position: new THREE.Vector3( p.x * 0.18 - 0.9, p.y + 5.8, p.z * 0.4 + 13.6 ),
			target: new THREE.Vector3( p.x * 0.18 - 0.9, p.y - 1.4, p.z * 0.4 - 1.2 ),
		};

	}

	let elapsed = 0;

	return {
		scene,
		map,
		interactables: [ ...map.interactables, bash ],
		defaultView: {
			position: new THREE.Vector3( -0.9, 7.8, 16.2 ),
			target: new THREE.Vector3( -0.9, -0.6, -1.8 ),
		},
		getStepView,
		runCommand,
		reset,
		goToStep,
		update( dt ) {

			elapsed += dt;
			const activeId = steps.length ? steps[ currentIndex ].componentId : 'bash';
			map.update( dt, { activeId } );
			animateComponent( bash, dt, elapsed, { active: activeId === 'bash' } );
			hopLinks.forEach( ( link ) => link.update( dt ) );

		},
	};

}
