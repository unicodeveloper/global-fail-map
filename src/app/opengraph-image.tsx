import { ImageResponse } from 'next/og';

export const alt =
  'Global Fail Map. Explore abandoned projects, companies and experiments around the world.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: '#22211f',
        color: '#f5f3ee',
        width: '100%',
        height: '100%',
        display: 'flex',
        padding: 64,
        flexDirection: 'column',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 600,
          fontSize: 76,
          lineHeight: 1.08,
          fontWeight: 600,
          letterSpacing: -4,
        }}
      >
        Global Fail Map
      </div>
      <div
        style={{
          display: 'flex',
          width: 570,
          marginTop: 28,
          color: '#bcb8b1',
          fontSize: 28,
          lineHeight: 1.5,
        }}
      >
        Abandoned projects, companies and experiments. Explore what happened,
        and why.
      </div>
      <div
        style={{
          position: 'absolute',
          right: -65,
          top: 75,
          display: 'flex',
          width: 480,
          height: 480,
          borderRadius: '50%',
          border: '1px solid #77736b',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#292824',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 220,
            height: 480,
            borderRadius: '50%',
            border: '1px solid #5c5952',
          }}
        />
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            width: 480,
            height: 180,
            borderRadius: '50%',
            border: '1px solid #5c5952',
          }}
        />
        {[
          { top: 118, left: 135 },
          { top: 295, left: 185 },
          { top: 200, left: 325 },
        ].map((point, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              ...point,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#e38f6e',
              display: 'flex',
              boxShadow: '0 0 0 7px #e38f6e25',
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 48,
          left: 64,
          color: '#a9a59e',
          fontSize: 20,
        }}
      >
        Research by Valyu
      </div>
    </div>,
    size,
  );
}
