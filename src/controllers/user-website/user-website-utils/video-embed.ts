/**
 * Video Embed Builder
 *
 * Pure helper extracted verbatim from shortcodeResolver.service.ts.
 * Turns a video_url custom field into a responsive iframe embed for the
 * {{post.video_embed}} token. Supports YouTube, Dailymotion, Vimeo, Loom.
 *
 * No DB, no logger, no side effects.
 */

export function buildVideoEmbed(url: string): string {
  if (!url) return "";

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/
  );
  if (ytMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Dailymotion: dailymotion.com/video/ID, dai.ly/ID
  const dmMatch = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([\w]+)/);
  if (dmMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://www.dailymotion.com/embed/video/${dmMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`;
  }

  // Vimeo: vimeo.com/ID
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="autoplay;fullscreen;picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Loom: loom.com/share/ID
  const loomMatch = url.match(/loom\.com\/share\/([\w]+)/);
  if (loomMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;"><iframe src="https://www.loom.com/embed/${loomMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`;
  }

  return "";
}
