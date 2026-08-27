import * as THREE from 'three';
import { CATEGORIES } from '../data/components.js';
import { addStandardLighting } from '../utils/sceneKit.js';
import { buildSystemMap } from '../utils/systemMap.js';

// 01 · What is the GNU Hurd. The whole machine at rest: the microkernel below
// the privilege boundary, every server and translator above it, and an IPC
// path from each one down into Mach.

export function buildOverviewWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );

	const map = buildSystemMap( scene );
	map.resetStates( 'done' );
	map.setState( 'gnu-mach', 'active' );
	map.links.forEach( ( link ) => link.setActive( true ) );

	return {
		scene,
		map,
		interactables: map.interactables,
		legendCategories: Object.entries( CATEGORIES ),
		defaultView: {
			position: new THREE.Vector3( -0.9, 7.4, 15.4 ),
			target: new THREE.Vector3( -0.9, -1.2, -1.8 ),
		},
		update( dt ) {

			map.update( dt, { activeId: 'gnu-mach' } );

		},
	};

}
