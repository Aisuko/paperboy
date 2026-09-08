// Reads the theme back out of CSS.
//
// css/base.css and css/main.css are the single source of truth for every
// colour on the site, including the three.js scenes. This module resolves the
// `--stage-*`, `--rig-*`, `--bloom-*` and `--hero-*` custom properties on
// :root into plain numbers so scene code can use them, which is why there is
// no second palette in JS to drift out of sync.
//
// Deliberately imports nothing — not even three — so the same file works from
// the landing page and from both sites without an importmap entry.

const light = window.matchMedia( '(prefers-color-scheme: light)' );

export const isLight = light.matches;

// Safari returns a leading space from getPropertyValue, hence the trim().
// Re-read the computed style each time: `getComputedStyle` returns a live
// object, but caching the resolved values would defeat the reload below.
function read( name ) {

	return getComputedStyle( document.documentElement ).getPropertyValue( name ).trim();

}

// '#rgb' | '#rrggbb' | 'rgb(r,g,b)' | 'rgba(r,g,b,a)'  ->  0xrrggbb
export function hex( name, fallback = 0x000000 ) {

	const value = read( name );
	if ( ! value ) return fallback;

	if ( value[ 0 ] === '#' ) {

		const body = value.slice( 1 );
		if ( body.length === 3 ) return parseInt( body.replace( /./g, ( c ) => c + c ), 16 );
		if ( body.length >= 6 ) return parseInt( body.slice( 0, 6 ), 16 );
		return fallback;

	}

	const parts = value.match( /-?[\d.]+/g );
	if ( ! parts || parts.length < 3 ) return fallback;
	const [ r, g, b ] = parts.map( ( n ) => Math.min( 255, Math.max( 0, Math.round( parseFloat( n ) ) ) ) );
	return ( r << 16 ) | ( g << 8 ) | b;

}

export function num( name, fallback = 0 ) {

	const value = parseFloat( read( name ) );
	return Number.isFinite( value ) ? value : fallback;

}

// { key: '--token' } -> { key: 0xrrggbb }
export function palette( map ) {

	const out = {};
	for ( const key in map ) out[ key ] = hex( map[ key ] );
	return out;

}

// The scenes bake their colours into materials at build time, so a live OS
// theme change cannot be picked up without rebuilding every world. Reloading
// is one line and guarantees the chrome and the canvas never disagree.
light.addEventListener( 'change', () => location.reload() );
