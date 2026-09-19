/* frame-ticker 仅发布 UMD：由 index.html 的经典 <script> 挂到 window，
   此 shim 将其转发为 ESM default（three-globe 内部已兼容 .default || 本体）。 */
const FT = (typeof self !== 'undefined' ? self : window).FrameTicker;
export default FT;
