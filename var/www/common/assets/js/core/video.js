(() => {
    'use strict';

    const unloadAllVideos = () => {
        document.querySelectorAll('video').forEach((video) => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        });
    };

    const buildVideoHtml = (id, videoId, languageCode = 'en', hasSubtitle = false) => {
        if (!id || !videoId) return '';
        const videoPath = `/common/assets/videos/${videoId}.mp4`;
        const subtitlePath = `/common/assets/videos/subtitles/${videoId}_${languageCode}.vtt`;
        const subtitleTrack = hasSubtitle
            ? `<track src="${subtitlePath}" kind="subtitles" srclang="${languageCode}" label="${languageCode}" default>`
            : '';
        return `
            <div class="video-container" data-identifier="${id}">
                <video id="${id}Video" controls muted controlsList="nodownload" preload="metadata">
                    <source src="${videoPath}" type="video/mp4">${subtitleTrack}
                </video>
            </div>
        `;
    };

    const fileExists = async (url) => {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (!response.ok && response.status !== 404) {
                console.warn(`Error fetching file: ${url}`);
            }
            return response.ok;
        } catch (error) {
            console.error(`Failed to fetch ${url}:`, error);
            return false;
        }
    };

    const videoHTML = async (id, videoId, languageCode = 'en', hasSubtitle = false) => {
        const videoPath = `/common/assets/videos/${videoId}.mp4`;
        const subtitlePath = `/common/assets/videos/subtitles/${videoId}_${languageCode}.vtt`;

        const videoExists = await fileExists(videoPath);
        if (!videoExists) {
            console.error(`Video file not found: ${videoPath}`);
            return '<div class="error">Video not available</div>';
        }

        let subtitleExists = false;
        try {
            subtitleExists = hasSubtitle ? await fileExists(subtitlePath) : false;
        } catch (error) {
            console.warn(`Subtitle file not found: ${subtitlePath}`);
        }

        return buildVideoHtml(id, videoId, languageCode, subtitleExists);
    };

    window.SimVideo = Object.freeze({
        unloadAllVideos,
        buildVideoHtml,
        videoHTML
    });
})();