import React from "react";
import ProgramGridItem from "./ProgramGridItem";
import { Program } from "../../domain/model/program";
import { Popup } from "../../domain/usecase/popup";

interface RankingProgramsProps {
  programs: Program[];
  popup: Popup;
  showComponent: boolean;
}

const RankingPrograms: React.FC<RankingProgramsProps> = ({ programs, popup, showComponent }) => {
  if (!showComponent) {
    return null;
  }

  return (
    <div className="section-container">
      <div className="section-title-container">
        <span className="section-title"> ランキング </span>
      </div>
      <div className="grid-container">
        {programs.map((p, index) => {
          const elapsed = popup.toElapsedTime(p);
          const rank = index + 1;
          return <ProgramGridItem program={p} elapsedTime={elapsed} rank={rank} key={p.id} />;
        })}
      </div>
    </div>
  );
};

export default RankingPrograms;
