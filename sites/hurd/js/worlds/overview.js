import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COMPONENTS, CATEGORIES, getComponent } from '../data/components.js';
import { createComponentObject, pulseHeart } from '../components3d.js';
import { addStandardLighting, createStarfield } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';

const CORE_RING = [ 'auth', 'proc', 'exec', 'init', 'crash' ];

export function buildOverviewWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x8b7bff );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const core = getComponent( 'gnu-mach' );
	const coreObj = createComponentObject( core );
	rig.add( coreObj );

	const coreLabel = document.createElement( 'div' );
	coreLabel.className = 'label2d';
	coreLabel.textContent = 'GNU Mach';
	const coreLabelObj = new CSS2DObject( coreLabel );
	coreLabelObj.position.set( 0, 1.0, 0 );
	coreObj.add( coreLabelObj );

	const interactables = [ coreObj ];
	const links = [];
	const spinning = [ coreObj ];

	const innerItems = COMPONENTS.filter( ( c ) => CORE_RING.includes( c.id ) );
	const outerItems = COMPONENTS.filter( ( c ) => c.id !== 'gnu-mach' && ! CORE_RING.includes( c.id ) );

	function placeRing( items, radius, yJitter ) {

		items.forEach( ( comp, i ) => {

			const obj = createComponentObject( comp );
			const angle = ( i / items.length ) * Math.PI * 2;
			obj.position.set( Math.cos( angle ) * radius, ( i % 2 === 0 ? 1 : -1 ) * yJitter, Math.sin( angle ) * radius );
			rig.add( obj );
			interactables.push( obj );
			spinning.push( obj );

			const label = document.createElement( 'div' );
			label.className = 'label2d';
			label.textContent = comp.name;
			const labelObj = new CSS2DObject( label );
			labelObj.position.set( 0, 0.68, 0 );
			obj.add( labelObj );

			const color = CATEGORIES[ comp.category ].color;
			links.push( new IPCLink( rig, new THREE.Vector3( 0, 0, 0 ), obj.position.clone(), color, {
				particleCount: 2, speed: 0.22 + Math.random() * 0.1, radius: 0.016,
			} ) );

		} );

	}

	placeRing( innerItems, 2.1, 0.2 );
	placeRing( outerItems, 3.7, 0.32 );

	// legend content, rendered into the DOM by main.js caller
	const legendCategories = Object.entries( CATEGORIES );

	let elapsed = 0;

	return {
		scene,
		interactables,
		defaultView: {
			position: new THREE.Vector3( 0, 3.4, 7.6 ),
			target: new THREE.Vector3( 0, 0, 0 ),
		},
		legendCategories,
		update( dt ) {

			elapsed += dt;
			rig.rotation.y += dt * 0.05;
			for ( const obj of spinning ) {

				if ( obj.userData.spin ) obj.rotation.y += dt * obj.userData.spin;

			}

			pulseHeart( coreObj, elapsed );
			for ( const link of links ) link.update( dt );

		},
	};

}
