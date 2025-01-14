import React, { useState } from "react";
import ProgramGridItem from "./ProgramGridItem";
import { Program } from "../../domain/model/program";
import { Popup } from "../../domain/usecase/popup";

interface ComingProgramsProps {
  programs: Program[];
  popup: Popup;
}

const ComingPrograms: React.FC<ComingProgramsProps> = ({ programs, popup }) => {
  const [showAll, setShowAll] = useState(false);
  const programCountPerRow = 5;
  const displayedPrograms = showAll ? programs : programs.slice(0, programCountPerRow);

  return (
    <div className="section-container" id="coming-section">
      <div className="section-title-container">
        <span className="section-title"> 予約番組 </span>
      </div>
      {programs.length === 0 ? (
        <div className="no-programs-container" id="coming-no-programs">
          <span className="no-programs-text">現在、予約番組はありません。</span>
        </div>
      ) : (
        <>
          <div className="grid-container">
            {displayedPrograms.map((p) => {
              const elapsed = popup.toElapsedTime(p);
              return (
                <ProgramGridItem program={p} elapsedTime={elapsed} rank={undefined} key={p.id} />
              );
            })}
          </div>
          {programs.length > programCountPerRow && !showAll && (
            <div className="show-more-container">
              <button className="show-more-button" onClick={() => setShowAll(true)}>
                もっと見る
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ComingPrograms;
