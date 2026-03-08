import React from 'react';

export function ShotCardPlaceholderGrid(): React.ReactElement {
  return (
    <>
      <div className="h-8 mb-3" aria-hidden="true" />
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        <div className="aspect-square" />
        <div className="aspect-square" />
        <div className="aspect-square" />
      </div>
    </>
  );
}
