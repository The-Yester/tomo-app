// Apple Music Developer Token
// Generated on: ${new Date().toISOString().split('T')[0]}
// Expires in: 180 days
export const APPLE_MUSIC_TOKEN = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjlESDlCVTVBQUMifQ.eyJpYXQiOjE3NzIwNDk3ODksImV4cCI6MTc4NzYwMTc4OSwiaXNzIjoiRzVIWDZVUTY1NyJ9._OUaHLu719zKXOS5ZTaLS7Uwrow8tEaDrGO3pek4fd6tqMrYSzAzGfgPyvp5a4QN1f84F3TNLHR9UIhs1LPbhQ';

export const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

export const getAppleMusicHeaders = () => {
    return {
        'Authorization': `Bearer ${APPLE_MUSIC_TOKEN}`,
        'Content-Type': 'application/json'
    };
};
