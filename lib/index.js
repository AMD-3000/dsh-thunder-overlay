// Host half of dsh-thunder-overlay.
//
// Pure UI plugin: the host side has no behaviour. The empty `apply` exists only
// so the bundle shows up as a real entry in the profile's cordis.yml / Loader;
// the browser half ships via package.json -> exports["./client"] and
// dsh.client, exactly like the shipped @deepseek-ai/dsh-client-ui-* surfaces.
export function apply() {}
