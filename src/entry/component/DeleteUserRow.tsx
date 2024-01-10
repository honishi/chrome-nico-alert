import React, { useEffect, useRef } from "react";

export default function DeleteUserRow(props: {
  userId: string;
  userNameResolver: (userId: string) => Promise<string>;
  onClick: () => Promise<void>;
}): React.JSX.Element {
  const divRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const onClick = async () => {
    // console.log("remove", userId);
    await props.onClick();
    divRef.current?.remove();
  };
  const userPageUrl = props.userId.startsWith("ch")
    ? `https://ch.nicovideo.jp/${props.userId}`
    : `https://www.nicovideo.jp/user/${props.userId}`;
  // https://qiita.com/itinerant_programmer/items/632acf6d14a54766693f
  useEffect(() => {
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || textRef.current === null) {
        return;
      }
      textRef.current.textContent = await props.userNameResolver(props.userId);
      observer.disconnect();
    });
    if (divRef.current !== null) {
      observer.observe(divRef.current);
    }
    return () => observer.disconnect();
  }, [props.userId]);
  return (
    <div className="auto-open-user-div" user-id={props.userId} ref={divRef}>
      <button className="remove-button" onClick={onClick}>
        [削除]
      </button>
      <span className="user-name" ref={textRef}>
        .....
      </span>
      <a className="user-link" href={userPageUrl} target="_blank">
        ({props.userId})
      </a>
    </div>
  );
}
