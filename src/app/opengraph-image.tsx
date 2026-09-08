import { ImageResponse } from 'next/og';

export const alt = 'Global Fail Map. Big ideas. Hard landings. The world is built on attempts.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ background: '#101311', color: '#edece3', width: '100%', height: '100%', display: 'flex', padding: '58px 70px', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', fontSize: 24, letterSpacing: 5, color: '#f18a57' }}>GLOBAL FAIL MAP</div>
      <div style={{ display: 'flex', marginTop: 70, fontSize: 96, lineHeight: 0.98, fontWeight: 700, letterSpacing: -6 }}>Big ideas.<br />Hard landings.</div>
      <div style={{ display: 'flex', marginTop: 38, color: '#a6aba3', fontSize: 26 }}>The world is built on attempts. Explore what came before.</div>
      <div style={{ position: 'absolute', right: 66, top: 130, display: 'flex', width: 365, height: 365, borderRadius: '50%', border: '2px solid #485047', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: 180, height: 365, borderRadius: '50%', border: '2px solid #485047' }} />
        <div style={{ position: 'absolute', display: 'flex', width: 365, height: 130, borderRadius: '50%', border: '2px solid #485047' }} />
        <div style={{ position: 'absolute', top: 76, left: 72, width: 17, height: 17, borderRadius: '50%', background: '#f18a57', display: 'flex' }} />
        <div style={{ position: 'absolute', top: 115, right: 70, width: 17, height: 17, borderRadius: '50%', background: '#a8cba1', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 82, left: 110, width: 17, height: 17, borderRadius: '50%', background: '#d4be79', display: 'flex' }} />
      </div>
      <div style={{ display: 'flex', position: 'absolute', bottom: 42, left: 70, right: 70, justifyContent: 'space-between', borderTop: '1px solid #3a4139', paddingTop: 20, fontSize: 17, letterSpacing: 2 }}><span>READ THE EVIDENCE. BUILD SOMETHING BETTER.</span><span>BY VALYU</span></div>
    </div>, size,
  );
}
