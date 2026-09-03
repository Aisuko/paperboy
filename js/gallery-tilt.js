const reduceMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
const MAX_TILT = 7;

if ( ! reduceMotion ) {

	document.querySelectorAll( '[data-tilt]' ).forEach( ( tile ) => {

		tile.addEventListener( 'pointermove', ( event ) => {

			const rect = tile.getBoundingClientRect();
			const rotY = ( ( event.clientX - rect.left ) / rect.width - 0.5 ) * MAX_TILT * 2;
			const rotX = ( 0.5 - ( event.clientY - rect.top ) / rect.height ) * MAX_TILT * 2;
			tile.style.transform = `perspective(900px) rotateX(${ rotX }deg) rotateY(${ rotY }deg) translateY(-4px)`;

		} );

		tile.addEventListener( 'pointerleave', () => {

			tile.style.transform = '';

		} );

	} );

}
