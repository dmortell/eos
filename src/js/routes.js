// import StoriesPage from '../pages/stories.svelte';
// import StoryPage from '../pages/story.svelte';
import HomePage from '../pages/Home.svelte';
import PanelRight from '$lib/PanelRight.svelte';

var routes = [
	{ path: '/', component: HomePage, },
	{ path: '/about/', name:'about', asyncComponent: () => import('../pages/About.svelte'), },	// async lazy load components
	{ path: '/panel-right/', component: PanelRight, },

	//   { path: '/', component: StoriesPage, master: true, detailRoutes: [ { path: '/item/:id', component: StoryPage, }, ] },
	// { path: '/some-page/', component: SomeComponent, options: { props: { foo: 'bar', bar: true, }, }, }
	// { path: '/about/', async({ resolve }) { import('./pages/about.svelte').then((module) => { resolve({ component: module.default }) }); } , },
	// { path: '/login/', component: LoginPage, },
	// { path: '/blog/:postId/comments/:commentId/', component: BlogPost, }		// route with params
	// /blog/45/comments/122/  --> props passed will be: { postId: '45', commentId: '122', }
	// { path: '/some-page/', component: SomeComponent, options: { props: { foo: 'bar', bar: true, }, }, }

	// { path: '(.*)', component: NotFound, },		// Default route (404 page). MUST BE THE LAST
];

export default routes;