/** U06 : largeur de contenu APRÈS le rail, jamais une seconde coque d'appel. */
export const ICOM_WORKSPACE_SPLIT_MIN = 880

export const ICOM_WORKSPACE_CSS = `
.icom-messages-page[data-layout="adaptive"] {
  container: icom-workspace / inline-size;
}
.icom-messages-page[data-layout="adaptive"] .icom-page-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.icom-messages-page[data-layout="adaptive"] .icom-page-list {
  border-right: 0;
}
.icom-messages-page[data-layout="adaptive"] .icom-page-detail {
  display: none;
}
.icom-messages-page[data-layout="adaptive"][data-has-detail="true"] .icom-page-list {
  display: none;
}
.icom-messages-page[data-layout="adaptive"][data-has-detail="true"] .icom-page-detail {
  display: flex;
}
.icom-messages-page[data-layout="adaptive"] .icom-page-navigation,
.icom-messages-page[data-layout="adaptive"][data-mobile="true"] .icom-page-navigation {
  display: flex;
  flex-wrap: wrap;
}
.icom-messages-page[data-layout="adaptive"] .icom-page-navigation a {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: center;
}
.icom-messages-page[data-layout="adaptive"] .icom-page-heading {
  flex-wrap: wrap;
  padding-inline: 16px;
}
.icom-messages-page[data-layout="adaptive"] .msg-search-row input {
  min-width: 0;
}
.icom-messages-page[data-layout="adaptive"] .msg-list-scope {
  overflow-wrap: anywhere;
}
.icom-messages-page[data-layout="adaptive"][data-mobile="true"][data-has-detail="true"] {
  height: 100%;
  min-height: 0;
}
.icom-messages-page[data-layout="adaptive"][data-mobile="true"][data-has-detail="true"] .icom-page-heading {
  display: none;
}
@container icom-workspace (min-width: ${ICOM_WORKSPACE_SPLIT_MIN}px) {
  .icom-messages-page[data-layout="adaptive"] .icom-page-columns {
    grid-template-columns: minmax(300px, 35%) minmax(0, 1fr);
  }
  .icom-messages-page[data-layout="adaptive"] .icom-page-list,
  .icom-messages-page[data-layout="adaptive"][data-has-detail="true"] .icom-page-list {
    display: flex;
    border-right: 1px solid var(--border);
  }
  .icom-messages-page[data-layout="adaptive"] .icom-page-detail {
    display: flex;
  }
}
`
