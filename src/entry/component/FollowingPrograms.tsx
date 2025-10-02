import React from "react";
import ProgramGridItem from "./ProgramGridItem";
import PushStatusDisplay from "./PushStatusDisplay";
import { Program } from "../../domain/model/program";
import { Popup } from "../../domain/usecase/popup";
import { useSticky } from "../hooks/useSticky";

interface FollowingProgramsProps {
  programs: Program[];
  popup: Popup;
  rankingPrograms: Program[];
  showPushStatus: boolean;
}

const FollowingPrograms: React.FC<FollowingProgramsProps> = ({
  programs,
  popup,
  rankingPrograms,
  showPushStatus,
}) => {
  const rankOf = (program: Program): number | undefined => {
    const rankingProgramIds = rankingPrograms.map((p) => p.id);
    const index = rankingProgramIds.indexOf(program.id);
    if (index === -1) {
      return undefined;
    }
    return index + 1;
  };

  const { sentinelRef, stickyRef, isSticky } = useSticky<HTMLDivElement>();

  return (
    <div className="section-container">
      <div ref={sentinelRef} style={{ height: "1px", width: "100%", pointerEvents: "none" }} />
      <div
        ref={stickyRef}
        className={`section-title-container${isSticky ? " section-title-container-sticky" : ""}`}
      >
        <span className="section-title"> フォロー中の番組 </span>
        {showPushStatus && <PushStatusDisplay />}
      </div>
      {programs.length === 0 ? (
        <div
          className="no-programs-container"
          style={{ display: "block" }}
          id="following-no-programs"
        >
          <span className="no-programs-text">現在、放送中の番組はありません。</span>
        </div>
      ) : (
        <div className="grid-container" id="following">
          {programs.map((p) => {
            const elapsed = popup.toElapsedTime(p);
            const rank = rankOf(p);
            return <ProgramGridItem program={p} elapsedTime={elapsed} rank={rank} key={p.id} />;
          })}
        </div>
      )}
    </div>
  );
};

export default FollowingPrograms;
