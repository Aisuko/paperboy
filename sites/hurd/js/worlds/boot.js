import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BOOT_STEPS } from '../data/bootSteps.js';
import { getComponent, CATEGORIES } from '../data/components.js';
import { createComponentObject, pulseHeart } from '../components3d.js';
import { addStandardLighting, createStarfield } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

const EXTERNAL_LOOK = {
	grub: { shape: 'module', category: 'kernel', name: 'GRUB', colorOverride: 0x9aa0b8 },
	login: { shape: 'server', category: 'core', name: 'login', colorOverride: 0x35d0ba },
};

const SPACING = 2.35;

export function buildBootWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0xffb84d );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const nodes = [];
	const total = BOOT_STEPS.length;
	const offset = ( ( total - 1 ) * SPACING ) / 2;

	BOOT_STEPS.forEach( ( step, i ) => {

		let comp;
		if ( step.componentId ) {

			comp = getComponent( step.componentId );

		} else {

			const look = EXTERNAL_LOOK[ step.id ] || EXTERNAL_LOOK.grub;
			comp = { id: step.id, name: look.name, category: look.category, shape: look.shape };

		}

		const obj = createComponentObject( comp );
		obj.position.set( i * SPACING - offset, 0, 0 );
		obj.userData.stepIndex = i;
		rig.add( obj );

		const label = document.createElement( 'div' );
		label.className = 'label2d';
		label.textContent = comp.name;
		const labelObj = new CSS2DObject( label );
		labelObj.position.set( 0, 0.7, 0 );
		obj.add( labelObj );

		nodes.push( obj );

		if ( i > 0 ) {

			const color = CATEGORIES[ comp.category ] ? CATEGORIES[ comp.category ].color : 0xffb84d;
			new IPCLink( rig, nodes[ i - 1 ].position.clone(), obj.position.clone(), color, {
				particleCount: 1, speed: 0.4, radius: 0.014, arc: 0.35,
			} );

		}

	} );

	let elapsed = 0;
	let currentIndex = 0;

	function highlight( index ) {

		nodes.forEach( ( node, i ) => {

			const active = i === index;
			const done = i < index;
			const targetScale = active ? 1.35 : 1;
			tween( 0.45, ( t ) => {

				const s = THREE.MathUtils.lerp( node.scale.x, targetScale, t );
				node.scale.setScalar( s );

			}, { easing: Easing.backOut } );

			node.traverse( ( child ) => {

				if ( child.material && 'emissiveIntensity' in child.material ) {

					child.material.emissiveIntensity = active ? 0.85 : ( done ? 0.4 : 0.2 );

				}
				if ( child.userData.isEnergyRing ) {

					child.material.opacity = active ? 0.95 : ( done ? 0.6 : 0.3 );

				}

			} );

		} );

	}

	highlight( 0 );

	return {
		scene,
		interactables: nodes,
		totalSteps: total,
		defaultView: {
			position: new THREE.Vector3( nodes[ 0 ].position.x, 2.0, 4.6 ),
			target: new THREE.Vector3( nodes[ 0 ].position.x, 0, 0 ),
		},
		getStepView( index ) {

			const n = nodes[ Math.max( 0, Math.min( total - 1, index ) ) ];
			return {
				position: new THREE.Vector3( n.position.x, 2.0, 4.8 ),
				target: new THREE.Vector3( n.position.x, 0, 0 ),
			};

		},
		goToStep( index ) {

			currentIndex = Math.max( 0, Math.min( total - 1, index ) );
			highlight( currentIndex );

		},
		update( dt ) {

			elapsed += dt;
			nodes.forEach( ( node, i ) => {

				if ( node.userData.spin ) node.rotation.y += dt * node.userData.spin * ( i === currentIndex ? 1.6 : 0.4 );
				pulseHeart( node, elapsed );

			} );

		},
	};

}
