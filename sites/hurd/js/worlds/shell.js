import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { getComponent, CATEGORIES } from '../data/components.js';
import { createComponentObject, pulseHeart } from '../components3d.js';
import { addStandardLighting, createStarfield } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

// bash is a pseudo-component — the shell process itself — not one of the
// real Hurd servers in data/components.js, so it needs its own look.
const EXTERNAL_LOOK = {
	bash: { shape: 'module', category: 'core', name: 'bash' },
};

const SPACING = 2.35;

function resolveStepComponent( step ) {

	const comp = getComponent( step.componentId );
	if ( comp ) return comp;
	const look = EXTERNAL_LOOK[ step.componentId ] || EXTERNAL_LOOK.bash;
	return { id: step.componentId, name: look.name, category: look.category, shape: look.shape };

}

function disposeObject3D( obj ) {

	obj.traverse( ( child ) => {

		if ( child.geometry ) child.geometry.dispose();
		if ( child.material ) {

			const mats = Array.isArray( child.material ) ? child.material : [ child.material ];
			mats.forEach( ( m ) => m.dispose() );

		}
		if ( child.isCSS2DObject && child.element && child.element.parentNode ) child.element.parentNode.removeChild( child.element );

	} );
	if ( obj.parent ) obj.parent.remove( obj );

}

function disposeLink( link ) {

	link.dispose();
	if ( link.tube.parent ) link.tube.parent.remove( link.tube );
	link.particles.forEach( ( p ) => { if ( p.parent ) p.parent.remove( p ); } );

}

export function buildShellWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x4ce07a );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const nodes = []; // mutated in place so main.js's stored `interactables` reference stays valid
	let links = [];
	let currentIndex = 0;
	let idleLabel = null;

	function clearChain() {

		[ ...nodes ].forEach( ( n ) => disposeObject3D( n ) );
		nodes.length = 0;
		links.forEach( ( l ) => disposeLink( l ) );
		links = [];
		if ( idleLabel ) { disposeObject3D( idleLabel ); idleLabel = null; }

	}

	function showIdle() {

		clearChain();

		const comp = { id: 'bash-idle', name: 'bash', category: EXTERNAL_LOOK.bash.category, shape: EXTERNAL_LOOK.bash.shape };
		const obj = createComponentObject( comp );
		rig.add( obj );
		nodes.push( obj );

		const label = document.createElement( 'div' );
		label.className = 'label2d';
		label.textContent = 'bash';
		const labelObj = new CSS2DObject( label );
		labelObj.position.set( 0, 0.7, 0 );
		obj.add( labelObj );

		const hint = document.createElement( 'div' );
		hint.className = 'label2d label2d-dim';
		hint.textContent = 'waiting for a command ↓';
		const hintObj = new CSS2DObject( hint );
		hintObj.position.set( 0, -0.75, 0 );
		obj.add( hintObj );
		idleLabel = hintObj;

		currentIndex = 0;

	}

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

		links.forEach( ( link, i ) => link.setActive( i < index ) );

	}

	function runCommand( steps ) {

		clearChain();

		const total = steps.length;
		const offset = ( ( total - 1 ) * SPACING ) / 2;

		steps.forEach( ( step, i ) => {

			const comp = resolveStepComponent( step );
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

				const color = CATEGORIES[ comp.category ] ? CATEGORIES[ comp.category ].color : 0x4ce07a;
				const link = new IPCLink( rig, nodes[ i - 1 ].position.clone(), obj.position.clone(), color, {
					particleCount: 1, speed: 0.5, radius: 0.014, arc: 0.35,
				} );
				links.push( link );

			}

		} );

		currentIndex = 0;
		highlight( 0 );

	}

	showIdle();

	let elapsed = 0;

	return {
		scene,
		interactables: nodes,
		defaultView: {
			position: new THREE.Vector3( 0, 2.0, 4.6 ),
			target: new THREE.Vector3( 0, 0, 0 ),
		},
		getStepView( index ) {

			const n = nodes[ Math.max( 0, Math.min( nodes.length - 1, index ) ) ];
			return {
				position: new THREE.Vector3( n.position.x, 2.0, 4.8 ),
				target: new THREE.Vector3( n.position.x, 0, 0 ),
			};

		},
		runCommand,
		reset: showIdle,
		goToStep( index ) {

			currentIndex = Math.max( 0, Math.min( nodes.length - 1, index ) );
			highlight( currentIndex );

		},
		update( dt ) {

			elapsed += dt;
			nodes.forEach( ( node, i ) => {

				if ( node.userData.spin ) node.rotation.y += dt * node.userData.spin * ( i === currentIndex ? 1.6 : 0.4 );
				pulseHeart( node, elapsed );

			} );
			links.forEach( ( link ) => link.update( dt ) );

		},
	};

}
