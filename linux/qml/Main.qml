import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import QtQuick.Layouts
import QtQuick.Window

pragma ComponentBehavior: Bound

ApplicationWindow {
    id: root
    width: 1500
    height: 940
    minimumWidth: 1120
    minimumHeight: 720
    visible: true
    title: "WaifuX"
    color: "transparent"
    flags: Qt.Window | Qt.FramelessWindowHint | Qt.NoDropShadowWindowHint

    property color ink: "#fbfaf6"
    property color muted: "#c2c2bd"
    property color soft: "#8f9692"
    property color glass: "#5b202326"
    property color stroke: "#2cffffff"
    property color accent: "#8b3f58"
    property color cyan: "#27b9df"
    property int shellMargin: 10
    property string wallpaperSearchText: ""
    property int wallpaperPageNumber: 1
    property string mediaSearchText: ""
    property int mediaPageNumber: 1

    function sourceOf(item) {
        if (!item) return ""
        if (item.kind === "media" && item.path && String(item.path).match(/\.(mp4|webm|mkv|mov)$/i)) {
            if (item.poster || item.preview || item.image) return item.poster || item.preview || item.image
            return ""
        }
        return item.preview || item.thumbnail || item.poster || item.image || item.url || ""
    }

    function itemTitle(item, fallback) {
        if (!item) return fallback || "WaifuX"
        return item.title || item.name || item.id || fallback || "WaifuX"
    }

    function itemTag(item) {
        if (!item) return "动态"
        if (item.kind === "anime") return "动漫"
        if (item.kind === "workshop") return "创意工坊"
        if (item.kind === "media") return "动态"
        return "壁纸"
    }

    function itemMeta(item) {
        if (!item) return "WaifuX"
        var bits = []
        if (item.resolution) bits.push(item.resolution)
        if (item.category) bits.push(item.category)
        if (item.source) bits.push(item.source)
        if (item.size) bits.push(Math.max(1, Math.round(Number(item.size) / 1024 / 1024)) + " MB")
        return bits.length ? bits.join(" · ") : "WaifuX"
    }

    function setTab(tab) {
        app.setCurrentTab(tab)
    }

    function reloadWallpapers() {
        app.loadWallpapers(wallpaperSearchText, wallpaperPageNumber)
    }

    function selectWallpaperSource(source) {
        app.updateSetting("wallpaperSource", source)
        wallpaperPageNumber = 1
        reloadWallpapers()
    }

    function openWallpaperSearch() {
        wallpaperSearchField.text = wallpaperSearchText
        wallpaperSearchPopup.open()
    }

    function submitWallpaperSearch(text) {
        wallpaperSearchText = String(text || "").trim()
        wallpaperPageNumber = 1
        reloadWallpapers()
        wallpaperSearchPopup.close()
    }

    function reloadMedia() {
        app.loadMedia(mediaSearchText, mediaPageNumber)
    }

    function selectMediaMode(mode) {
        mediaPageNumber = 1
        app.setMediaMode(mode)
        if (mode !== 2) reloadMedia()
    }

    function openMediaSearch() {
        mediaSearchField.text = mediaSearchText
        mediaSearchPopup.open()
    }

    function submitMediaSearch(text) {
        mediaSearchText = String(text || "").trim()
        mediaPageNumber = 1
        reloadMedia()
        mediaSearchPopup.close()
    }

    function activateItem(item) {
        if (!item) return
        if (item.kind === "media") app.applyLiveWallpaper(item)
        else if (item.kind === "workshop") app.downloadWorkshop(item)
        else if (item.kind === "anime" && item.url) app.openExternal(item.url)
        else app.applyWallpaper(item)
    }

    function saveItem(item) {
        if (!item) return
        if (item.kind === "media") app.downloadMedia(item)
        else if (item.kind === "workshop") app.downloadWorkshop(item)
        else if (item.kind === "anime" && item.url) app.openExternal(item.url)
        else app.downloadWallpaper(item)
    }

    Connections {
        target: app
        function onToastChanged() {
            toastText.text = app.toast
            toastBox.opacity = 1
            toastTimer.restart()
        }
    }

    Timer {
        id: toastTimer
        interval: 3600
        onTriggered: toastBox.opacity = 0
    }

    Rectangle {
        id: shell
        anchors.fill: parent
        anchors.margins: root.shellMargin
        radius: 28
        clip: true
        color: "#050607"
        border.color: "#26ffffff"
        border.width: 1

        StackLayout {
            id: pages
            anchors.fill: parent
            currentIndex: ["home", "wallpaper", "media", "anime", "library", "settings"].indexOf(app.currentTab)

            HomePage {}
            WallpaperPage {}
            MediaPage {}
            AnimePage {}
            LibraryPage {}
            SettingsPage {}
        }

        MouseArea {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            height: 76
            acceptedButtons: Qt.LeftButton
            z: 5
            onPressed: root.startSystemMove()
        }

        WindowDots {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.leftMargin: 28
            anchors.topMargin: 30
            z: 20
        }

        Rectangle {
            id: navShell
            width: Math.min(470, parent.width - 300)
            height: 44
            radius: 22
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 22
            z: 20
            color: "#72535c5e"
            border.color: "#30ffffff"

            RowLayout {
                anchors.fill: parent
                anchors.margins: 4
                spacing: 2
                NavButton { label: "首页"; tab: "home" }
                NavButton { label: "壁纸"; tab: "wallpaper" }
                NavButton { label: "媒体"; tab: "media" }
                NavButton { label: "动漫"; tab: "anime" }
                NavButton { label: "我的"; tab: "library" }
            }
        }

        RowLayout {
            id: wallpaperNavControls
            visible: app.currentTab === "wallpaper"
            height: 40
            spacing: 8
            anchors.left: navShell.right
            anchors.leftMargin: 14
            anchors.right: settingsButton.left
            anchors.rightMargin: 12
            anchors.top: parent.top
            anchors.topMargin: 24
            z: 22

            RoundIconButton {
                text: "⌕"
                implicitWidth: 40
                implicitHeight: 40
                onClicked: root.openWallpaperSearch()
            }

            Rectangle {
                visible: wallpaperNavControls.width >= 330
                Layout.preferredWidth: 172
                Layout.fillHeight: true
                radius: 20
                color: "#47394246"
                border.color: "#24ffffff"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 4
                    spacing: 2

                    SegmentButton {
                        label: "自动"
                        active: (app.settings.wallpaperSource || "auto") === "auto"
                        Layout.fillWidth: true
                        onClicked: root.selectWallpaperSource("auto")
                    }
                    SegmentButton {
                        label: "Wall"
                        active: (app.settings.wallpaperSource || "auto") === "wallhaven"
                        Layout.fillWidth: true
                        onClicked: root.selectWallpaperSource("wallhaven")
                    }
                    SegmentButton {
                        label: "4K"
                        active: (app.settings.wallpaperSource || "auto") === "4kwallpapers"
                        Layout.fillWidth: true
                        onClicked: root.selectWallpaperSource("4kwallpapers")
                    }
                }
            }

            Rectangle {
                visible: wallpaperNavControls.width >= 190
                Layout.preferredWidth: 136
                Layout.fillHeight: true
                radius: 20
                color: "#35394246"
                border.color: "#24ffffff"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 4
                    spacing: 3

                    Button {
                        id: navPrevWallpaperPage
                        text: "‹"
                        enabled: root.wallpaperPageNumber > 1
                        Layout.preferredWidth: 32
                        Layout.fillHeight: true
                        onClicked: {
                            root.wallpaperPageNumber = Math.max(1, root.wallpaperPageNumber - 1)
                            root.reloadWallpapers()
                        }
                        background: Rectangle {
                            radius: 16
                            color: navPrevWallpaperPage.enabled ? (navPrevWallpaperPage.hovered ? "#25ffffff" : "transparent") : "transparent"
                        }
                        contentItem: Label {
                            text: navPrevWallpaperPage.text
                            color: navPrevWallpaperPage.enabled ? root.ink : "#70ffffff"
                            font.pixelSize: 22
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                    }

                    Label {
                        text: root.wallpaperPageNumber
                        color: root.ink
                        font.pixelSize: 14
                        font.bold: true
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        Layout.fillWidth: true
                    }

                    Button {
                        id: navNextWallpaperPage
                        text: "›"
                        Layout.preferredWidth: 32
                        Layout.fillHeight: true
                        onClicked: {
                            root.wallpaperPageNumber += 1
                            root.reloadWallpapers()
                        }
                        background: Rectangle {
                            radius: 16
                            color: navNextWallpaperPage.hovered ? "#25ffffff" : "transparent"
                        }
                        contentItem: Label {
                            text: navNextWallpaperPage.text
                            color: root.ink
                            font.pixelSize: 22
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                    }
                }
            }
        }

        RowLayout {
            id: mediaNavControls
            visible: app.currentTab === "media"
            height: 40
            spacing: 8
            anchors.left: navShell.right
            anchors.leftMargin: 14
            anchors.right: settingsButton.left
            anchors.rightMargin: 12
            anchors.top: parent.top
            anchors.topMargin: 24
            z: 22

            RoundIconButton {
                text: "⌕"
                implicitWidth: 36
                implicitHeight: 36
                enabled: app.mediaMode !== 2
                onClicked: root.openMediaSearch()
            }

            Rectangle {
                visible: mediaNavControls.width >= 240
                Layout.preferredWidth: 166
                Layout.fillHeight: true
                radius: 20
                color: "#47394246"
                border.color: "#24ffffff"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 4
                    spacing: 2

                    SegmentButton {
                        label: "动"
                        active: app.mediaMode === 0
                        Layout.fillWidth: true
                        onClicked: root.selectMediaMode(0)
                    }
                    SegmentButton {
                        label: "工坊"
                        active: app.mediaMode === 1
                        Layout.fillWidth: true
                        onClicked: root.selectMediaMode(1)
                    }
                    SegmentButton {
                        label: "本地"
                        active: app.mediaMode === 2
                        Layout.fillWidth: true
                        onClicked: root.selectMediaMode(2)
                    }
                }
            }

            Rectangle {
                visible: app.mediaMode !== 2 && mediaNavControls.width >= 360
                Layout.preferredWidth: 108
                Layout.fillHeight: true
                radius: 20
                color: "#35394246"
                border.color: "#24ffffff"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 4
                    spacing: 3

                    Button {
                        id: navPrevMediaPage
                        text: "‹"
                        enabled: root.mediaPageNumber > 1
                        Layout.preferredWidth: 28
                        Layout.fillHeight: true
                        onClicked: {
                            root.mediaPageNumber = Math.max(1, root.mediaPageNumber - 1)
                            root.reloadMedia()
                        }
                        background: Rectangle {
                            radius: 16
                            color: navPrevMediaPage.enabled ? (navPrevMediaPage.hovered ? "#25ffffff" : "transparent") : "transparent"
                        }
                        contentItem: Label {
                            text: navPrevMediaPage.text
                            color: navPrevMediaPage.enabled ? root.ink : "#70ffffff"
                            font.pixelSize: 22
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                    }

                    Label {
                        text: root.mediaPageNumber
                        color: root.ink
                        font.pixelSize: 14
                        font.bold: true
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        Layout.fillWidth: true
                    }

                    Button {
                        id: navNextMediaPage
                        text: "›"
                        Layout.preferredWidth: 28
                        Layout.fillHeight: true
                        onClicked: {
                            root.mediaPageNumber += 1
                            root.reloadMedia()
                        }
                        background: Rectangle {
                            radius: 16
                            color: navNextMediaPage.hovered ? "#25ffffff" : "transparent"
                        }
                        contentItem: Label {
                            text: navNextMediaPage.text
                            color: root.ink
                            font.pixelSize: 22
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                    }
                }
            }

            RoundIconButton {
                text: "■"
                implicitWidth: 36
                implicitHeight: 36
                onClicked: app.stopLiveWallpaper()
            }
        }

        RoundIconButton {
            id: settingsButton
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.rightMargin: 34
            anchors.topMargin: 22
            z: 20
            text: "⚙"
            active: app.currentTab === "settings"
            onClicked: app.setCurrentTab("settings")
        }
    }

    Popup {
        id: wallpaperSearchPopup
        width: Math.min(560, root.width - 96)
        height: 176
        x: Math.round((root.width - width) / 2)
        y: shell.y + 96
        modal: true
        focus: true
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        padding: 0
        onOpened: {
            wallpaperSearchField.forceActiveFocus()
            wallpaperSearchField.selectAll()
        }

        Overlay.modal: Rectangle {
            color: "#52000000"
        }

        background: Rectangle {
            radius: 30
            color: "#ed1b2227"
            border.color: "#38ffffff"
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 16

            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Label {
                    text: "搜索壁纸"
                    color: root.ink
                    font.pixelSize: 22
                    font.bold: true
                    Layout.fillWidth: true
                }

                RoundIconButton {
                    text: "×"
                    implicitWidth: 38
                    implicitHeight: 38
                    onClicked: wallpaperSearchPopup.close()
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 58
                radius: 29
                color: "#22ffffff"
                border.color: wallpaperSearchField.activeFocus ? "#68ffffff" : "#30ffffff"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 18
                    anchors.rightMargin: 8
                    spacing: 12

                    Label {
                        text: "⌕"
                        color: "#eaf1ef"
                        font.pixelSize: 22
                        font.bold: true
                    }

                    TextField {
                        id: wallpaperSearchField
                        Layout.fillWidth: true
                        Layout.preferredHeight: 48
                        color: root.ink
                        placeholderTextColor: "#90ffffff"
                        selectedTextColor: "#111111"
                        selectionColor: "#e8ffffff"
                        font.pixelSize: 16
                        leftPadding: 0
                        rightPadding: 0
                        placeholderText: "角色、风格、分辨率"
                        background: Rectangle { color: "transparent" }
                        onAccepted: root.submitWallpaperSearch(text)
                    }

                    GlassButton {
                        text: "搜索"
                        primary: true
                        implicitHeight: 44
                        implicitWidth: 92
                        onClicked: root.submitWallpaperSearch(wallpaperSearchField.text)
                    }
                }
            }
        }
    }

    Popup {
        id: mediaSearchPopup
        width: Math.min(560, root.width - 96)
        height: 176
        x: Math.round((root.width - width) / 2)
        y: shell.y + 96
        modal: true
        focus: true
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        padding: 0
        onOpened: {
            mediaSearchField.forceActiveFocus()
            mediaSearchField.selectAll()
        }

        Overlay.modal: Rectangle {
            color: "#52000000"
        }

        background: Rectangle {
            radius: 30
            color: "#ed1b2227"
            border.color: "#38ffffff"
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 16

            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Label {
                    text: app.mediaMode === 1 ? "搜索 Workshop" : "搜索动态壁纸"
                    color: root.ink
                    font.pixelSize: 22
                    font.bold: true
                    Layout.fillWidth: true
                }

                RoundIconButton {
                    text: "×"
                    implicitWidth: 38
                    implicitHeight: 38
                    onClicked: mediaSearchPopup.close()
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 58
                radius: 29
                color: "#22ffffff"
                border.color: mediaSearchField.activeFocus ? "#68ffffff" : "#30ffffff"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 18
                    anchors.rightMargin: 8
                    spacing: 12

                    Label {
                        text: "⌕"
                        color: "#eaf1ef"
                        font.pixelSize: 22
                        font.bold: true
                    }

                    TextField {
                        id: mediaSearchField
                        Layout.fillWidth: true
                        Layout.preferredHeight: 48
                        color: root.ink
                        placeholderTextColor: "#90ffffff"
                        selectedTextColor: "#111111"
                        selectionColor: "#e8ffffff"
                        font.pixelSize: 16
                        leftPadding: 0
                        rightPadding: 0
                        placeholderText: app.mediaMode === 1 ? "Workshop 标题、标签" : "动态壁纸、角色、场景"
                        background: Rectangle { color: "transparent" }
                        onAccepted: root.submitMediaSearch(text)
                    }

                    GlassButton {
                        text: "搜索"
                        primary: true
                        implicitHeight: 44
                        implicitWidth: 92
                        onClicked: root.submitMediaSearch(mediaSearchField.text)
                    }
                }
            }
        }
    }

    Rectangle {
        id: toastBox
        width: Math.min(520, root.width - 80)
        height: Math.max(54, toastText.implicitHeight + 28)
        anchors.right: shell.right
        anchors.bottom: shell.bottom
            anchors.margins: 18
        radius: 18
        color: "#df151719"
        border.color: "#36ffffff"
        opacity: 0
        z: 50
        Behavior on opacity { NumberAnimation { duration: 160 } }

        Label {
            id: toastText
            anchors.fill: parent
            anchors.margins: 14
            color: root.ink
            wrapMode: Text.WordWrap
            verticalAlignment: Text.AlignVCenter
        }
    }

    component WindowDots: Row {
        spacing: 12
        MacDot { colorValue: "#ff5f57"; onClicked: root.close() }
        MacDot { colorValue: "#ffbd2e"; onClicked: root.showMinimized() }
        MacDot {
            colorValue: "#28c840"
            onClicked: root.visibility === Window.Maximized ? root.showNormal() : root.showMaximized()
        }
    }

    component MacDot: Rectangle {
        signal clicked()
        property color colorValue: "#ffffff"
        width: 15
        height: 15
        radius: 8
        color: colorValue
        border.color: "#22ffffff"
        MouseArea { anchors.fill: parent; onClicked: parent.clicked() }
    }

    component NavButton: Button {
        id: navButton
        required property string label
        required property string tab
        text: label
        Layout.fillWidth: true
        Layout.fillHeight: true
        onClicked: root.setTab(tab)
        background: Rectangle {
            radius: 18
            color: app.currentTab === navButton.tab ? "#64737b7b" : navButton.hovered ? "#25ffffff" : "transparent"
            border.color: app.currentTab === navButton.tab ? "#35ffffff" : "transparent"
        }
        contentItem: Label {
            text: navButton.text
            color: app.currentTab === navButton.tab ? "#ffffff" : "#d9d8d3"
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            font.pixelSize: 16
            font.bold: true
        }
    }

    component RoundIconButton: Button {
        id: roundButton
        property bool active: false
        implicitWidth: 48
        implicitHeight: 48
        background: Rectangle {
            radius: 24
            color: roundButton.active ? "#63737b7b" : "#5b435052"
            border.color: "#35ffffff"
        }
        contentItem: Label {
            text: roundButton.text
            color: root.ink
            font.pixelSize: 20
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }

    component GlassButton: Button {
        id: glassButton
        property bool primary: false
        property bool danger: false
        implicitHeight: 48
        leftPadding: 22
        rightPadding: 22
        background: Rectangle {
            radius: 24
            color: glassButton.danger ? "#884b2328" : glassButton.primary ? root.accent : "#5b202326"
            border.color: glassButton.primary ? "#33ffffff" : "#26ffffff"
        }
        contentItem: Label {
            text: glassButton.text
            color: root.ink
            font.pixelSize: 16
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }

    component Pill: Rectangle {
        property string text: ""
        property color fill: "#7427b9df"
        height: 34
        width: label.implicitWidth + 24
        radius: 17
        color: fill
        Label {
            id: label
            anchors.centerIn: parent
            text: parent.text
            color: root.ink
            font.bold: true
            font.pixelSize: 14
        }
    }

    component SectionTitle: RowLayout {
        id: section
        property string title: ""
        property string subtitle: ""
        spacing: 14
        Layout.fillWidth: true
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4
            Label {
                text: section.title
                color: root.ink
                font.pixelSize: 24
                font.bold: true
            }
            Label {
                visible: section.subtitle.length > 0
                text: section.subtitle
                color: root.muted
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }
        }
    }

    component SearchField: TextField {
        id: searchField
        color: root.ink
        placeholderTextColor: "#a8ffffff"
        selectedTextColor: "#111111"
        selectionColor: "#e8ffffff"
        font.pixelSize: 15
        leftPadding: 18
        rightPadding: 18
        background: Rectangle {
            radius: height / 2
            color: searchField.activeFocus ? "#34ffffff" : "#24ffffff"
            border.color: searchField.activeFocus ? "#75ffffff" : "#30ffffff"
        }
    }

    component SegmentButton: Button {
        id: segmentButton
        required property string label
        required property bool active
        text: label
        implicitHeight: 38
        leftPadding: 18
        rightPadding: 18
        background: Rectangle {
            radius: 19
            color: segmentButton.active ? "#d9eef4f5" : segmentButton.hovered ? "#28ffffff" : "transparent"
            border.color: segmentButton.active ? "#f0ffffff" : "transparent"
        }
        contentItem: Label {
            text: segmentButton.text
            color: segmentButton.active ? "#192124" : "#ecf0ef"
            font.pixelSize: 14
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }

    component PageFrame: ScrollView {
        clip: true
        contentWidth: availableWidth
        ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
        ScrollBar.vertical.policy: ScrollBar.AsNeeded
        background: Rectangle { color: "#050607" }
    }

    component ContentPane: PageFrame {
        background: Rectangle { color: "#050607" }
    }

    component MediaArtwork: Item {
        id: art
        property var item
        property string imageSource: root.sourceOf(item)
        clip: true
        Rectangle {
            anchors.fill: parent
            color: "#15181b"
            gradient: Gradient {
                GradientStop { position: 0; color: "#20282b" }
                GradientStop { position: 1; color: "#08090a" }
            }
        }
        Image {
            anchors.fill: parent
            source: art.imageSource
            visible: art.imageSource.length > 0
            asynchronous: true
            fillMode: Image.PreserveAspectCrop
            cache: true
        }
    }

    component ShowcaseCard: Item {
        id: showcase
        required property var item
        property string kind: item && item.kind ? item.kind : "media"
        property real radius: 26
        property bool hovered: cardMouse.containsMouse
        signal primary()
        signal secondary()
        width: 330
        height: 176

        Item {
            id: cardSource
            anchors.fill: parent
            visible: false
            layer.enabled: true

            Rectangle {
                anchors.fill: parent
                radius: showcase.radius
                color: "#1a171d20"
            }
            MediaArtwork { anchors.fill: parent; item: showcase.item }
            Rectangle { anchors.fill: parent; color: showcase.hovered ? "#10000000" : "#24000000" }
            Rectangle {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: 76
                gradient: Gradient {
                    GradientStop { position: 0; color: "transparent" }
                    GradientStop { position: 1; color: "#d7000000" }
                }
            }
            Pill {
                anchors.left: parent.left
                anchors.top: parent.top
                anchors.leftMargin: 14
                anchors.topMargin: 14
                text: root.itemTag(showcase.item)
                fill: showcase.kind === "media" ? root.cyan : "#72535c5e"
            }
            Pill {
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.rightMargin: 14
                anchors.topMargin: 14
                text: showcase.item && showcase.item.resolution ? showcase.item.resolution : "3840x2160"
                fill: "#91000000"
            }
            Label {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.margins: 14
                text: root.itemTitle(showcase.item, "WaifuX")
                color: root.ink
                font.bold: true
                font.pixelSize: 16
                elide: Text.ElideRight
            }
        }

        Rectangle {
            id: cardMask
            anchors.fill: parent
            radius: showcase.radius
            color: "#ffffff"
            visible: false
            layer.enabled: true
        }

        MultiEffect {
            anchors.fill: parent
            source: cardSource
            maskEnabled: true
            maskSource: cardMask
            maskThresholdMin: 0.5
            maskSpreadAtMin: 0.04
        }

        Rectangle {
            anchors.fill: parent
            radius: showcase.radius
            color: "transparent"
            border.color: showcase.hovered ? "#5cffffff" : "#2affffff"
            border.width: 1
        }
        MouseArea {
            id: cardMouse
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            onClicked: (mouse) => mouse.button === Qt.RightButton ? showcase.secondary() : showcase.primary()
        }
    }

    component HomeStrip: Item {
        id: strip
        property string title: ""
        property string subtitle: ""
        property string targetTab: "media"
        property var modelDataList
        property var items: modelDataList || []
        property var featuredItem: items && items.length ? items[0] : null
        property string emptyText: "暂无内容，切换页面刷新后会显示在这里。"
        width: parent ? parent.width : 1200
        height: 264

        RowLayout {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.leftMargin: 54
            anchors.rightMargin: 54
            anchors.topMargin: 12
            height: 44
            spacing: 16

            Label {
                text: strip.title
                color: root.ink
                font.pixelSize: 25
                font.bold: true
                Layout.alignment: Qt.AlignVCenter
            }

            Label {
                text: strip.subtitle
                color: "#d2d7d4"
                font.pixelSize: 14
                elide: Text.ElideRight
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignVCenter
            }

            Pill {
                text: strip.items.length + " 项"
                fill: "#64344145"
                Layout.alignment: Qt.AlignVCenter
            }

            RoundIconButton {
                text: "›"
                implicitWidth: 38
                implicitHeight: 38
                onClicked: app.setCurrentTab(strip.targetTab)
                Layout.alignment: Qt.AlignVCenter
            }
        }

        ListView {
            visible: strip.items.length > 0
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            anchors.leftMargin: 54
            anchors.rightMargin: 54
            anchors.topMargin: 76
            anchors.bottomMargin: 16
            orientation: ListView.Horizontal
            spacing: 22
            clip: true
            cacheBuffer: 1200
            model: strip.items
            delegate: ShowcaseCard {
                required property var modelData
                item: modelData
                width: 336
                height: 174
                onPrimary: root.activateItem(item)
                onSecondary: root.saveItem(item)
            }
        }

        Rectangle {
            visible: strip.items.length === 0
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            anchors.leftMargin: 54
            anchors.rightMargin: 54
            anchors.topMargin: 76
            anchors.bottomMargin: 16
            radius: 28
            color: "#26222b30"
            border.color: "#26ffffff"

            RowLayout {
                anchors.centerIn: parent
                width: Math.min(560, parent.width - 48)
                spacing: 18

                Label {
                    text: strip.emptyText
                    color: root.ink
                    font.pixelSize: 18
                    font.bold: true
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                GlassButton {
                    text: "去刷新"
                    primary: true
                    onClicked: app.setCurrentTab(strip.targetTab)
                }
            }
        }
    }

    component CatalogCard: Item {
        id: card
        required property var item
        property string kind: item && item.kind ? item.kind : "wallpaper"
        property real radius: 28
        property bool hovered: cardHover.hovered
        signal primary()
        signal secondary()

        Item {
            id: catalogSource
            anchors.fill: parent
            visible: false
            layer.enabled: true

            Rectangle {
                anchors.fill: parent
                radius: card.radius
                color: "#171d20"
            }
            MediaArtwork {
                anchors.fill: parent
                item: card.item
            }
            Rectangle {
                anchors.fill: parent
                color: card.hovered ? "#08000000" : "#16000000"
            }
            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    GradientStop { position: 0.34; color: "transparent" }
                    GradientStop { position: 1; color: "#e5000000" }
                }
            }
        }

        Rectangle {
            id: catalogMask
            anchors.fill: parent
            radius: card.radius
            color: "#ffffff"
            visible: false
            layer.enabled: true
        }

        MultiEffect {
            anchors.fill: parent
            source: catalogSource
            maskEnabled: true
            maskSource: catalogMask
            maskThresholdMin: 0.5
            maskSpreadAtMin: 0.04
        }

        Rectangle {
            anchors.fill: parent
            radius: card.radius
            color: "transparent"
            border.color: card.hovered ? "#62ffffff" : "#28ffffff"
            border.width: 1
        }

        Pill {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.leftMargin: 14
            anchors.topMargin: 14
            text: root.itemTag(card.item)
            fill: card.kind === "media" ? root.cyan : "#7a4a5360"
        }
        ColumnLayout {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: 14
            spacing: 8
            Label {
                text: root.itemTitle(card.item, "WaifuX")
                color: root.ink
                font.pixelSize: 16
                font.bold: true
                elide: Text.ElideRight
                Layout.fillWidth: true
            }
            Label {
                text: root.itemMeta(card.item)
                color: root.muted
                elide: Text.ElideRight
                Layout.fillWidth: true
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                GlassButton { text: card.kind === "workshop" ? "下载" : "应用"; primary: true; Layout.fillWidth: true; implicitHeight: 38; onClicked: card.primary() }
                GlassButton { text: "保存"; Layout.fillWidth: true; implicitHeight: 38; onClicked: card.secondary() }
            }
        }

        HoverHandler {
            id: cardHover
        }
    }

    component HomePage: PageFrame {
        id: homePage
        property int heroIndex: 0
        property var heroList: app.wallpapers && app.wallpapers.length ? app.wallpapers
            : (app.libraryWallpapers && app.libraryWallpapers.length ? app.libraryWallpapers
            : (app.media && app.media.length ? app.media : []))
        property var heroItem: heroList && heroList.length ? heroList[Math.min(heroIndex, heroList.length - 1)] : null
        property var liveList: app.media && app.media.length ? app.media
            : (app.workshop && app.workshop.length ? app.workshop : app.libraryMedia)
        property var wallpaperList: app.wallpapers && app.wallpapers.length ? app.wallpapers : app.libraryWallpapers
        property var animeList: app.anime || []

        Column {
            width: parent.width
            spacing: 0

            Item {
                id: hero
                width: parent.width
                height: Math.max(500, Math.min(620, Math.round(root.height * 0.58)))
                clip: true

                MediaArtwork {
                    anchors.fill: parent
                    item: homePage.heroItem
                }
                Rectangle {
                    anchors.fill: parent
                    gradient: Gradient {
                        GradientStop { position: 0; color: "#4b000000" }
                        GradientStop { position: 0.48; color: "#32000000" }
                        GradientStop { position: 1; color: "#ba000000" }
                    }
                }
                Rectangle {
                    anchors.fill: parent
                    color: "#243a4f51"
                }

                ColumnLayout {
                    anchors.left: parent.left
                    anchors.leftMargin: Math.max(120, parent.width * 0.10)
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.verticalCenterOffset: 52
                    width: Math.min(620, parent.width * 0.48)
                    spacing: 18

                    Label {
                        text: root.itemTag(homePage.heroItem)
                        color: "#e8eded"
                        font.pixelSize: 18
                        font.bold: true
                    }
                    Label {
                        text: root.itemTitle(homePage.heroItem, "WaifuX")
                        color: root.ink
                        font.family: "Georgia"
                        font.pixelSize: Math.max(48, Math.min(68, root.width * 0.042))
                        font.bold: true
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }
                    Label {
                        text: root.itemMeta(homePage.heroItem)
                        color: "#dedfdc"
                        font.pixelSize: 18
                        font.bold: true
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }
                    RowLayout {
                        spacing: 14
                        GlassButton {
                            text: homePage.heroItem && homePage.heroItem.kind === "media" ? "▶ 应用动态" : "▶ 查看壁纸"
                            primary: true
                            onClicked: {
                                if (!homePage.heroItem) return
                                if (homePage.heroItem.kind === "media") app.applyLiveWallpaper(homePage.heroItem)
                                else app.applyWallpaper(homePage.heroItem)
                            }
                        }
                        GlassButton {
                            text: "♡ 9"
                            onClicked: {
                                if (!homePage.heroItem) return
                                if (homePage.heroItem.kind === "media") app.downloadMedia(homePage.heroItem)
                                else app.downloadWallpaper(homePage.heroItem)
                            }
                        }
                    }
                }

                RoundIconButton {
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: 46
                    text: "‹"
                    onClicked: {
                        if (homePage.heroList.length === 0) return
                        homePage.heroIndex = (homePage.heroIndex + homePage.heroList.length - 1) % homePage.heroList.length
                    }
                }
                RoundIconButton {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.rightMargin: 46
                    text: "›"
                    onClicked: {
                        if (homePage.heroList.length === 0) return
                        homePage.heroIndex = (homePage.heroIndex + 1) % homePage.heroList.length
                    }
                }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: 26
                    spacing: 10
                    Repeater {
                        model: Math.min(5, Math.max(1, homePage.heroList.length))
                        Rectangle {
                            required property int index
                            width: index === homePage.heroIndex % Math.max(1, homePage.heroList.length) ? 20 : 9
                            height: 9
                            radius: 5
                            color: index === homePage.heroIndex % Math.max(1, homePage.heroList.length) ? "#ecede8" : "#69ffffff"
                        }
                    }
                }
            }

            Item {
                width: parent.width
                height: lowerColumn.implicitHeight + 76
                clip: true

                MediaArtwork {
                    id: lowerBackdrop
                    anchors.fill: parent
                    item: homePage.heroItem
                    opacity: 0.32
                }

                MultiEffect {
                    anchors.fill: lowerBackdrop
                    source: lowerBackdrop
                    blurEnabled: true
                    blur: 0.84
                    blurMax: 64
                    brightness: -0.12
                    saturation: -0.18
                    opacity: 0.85
                }

                Rectangle {
                    anchors.fill: parent
                    gradient: Gradient {
                        GradientStop { position: 0; color: "#a2213034" }
                        GradientStop { position: 0.44; color: "#b4141c20" }
                        GradientStop { position: 1; color: "#d90b1013" }
                    }
                }
                Rectangle {
                    anchors.fill: parent
                    color: "#24cde7ee"
                }

                Column {
                    id: lowerColumn
                    anchors.fill: parent
                    anchors.topMargin: 32
                    anchors.bottomMargin: 44
                    spacing: 28
                    HomeStrip {
                        title: "热门动态壁纸"
                        subtitle: "MotionBGs、Workshop 与本地视频，不再混入静态壁纸。"
                        targetTab: "media"
                        modelDataList: homePage.liveList
                        emptyText: "动态壁纸还没有加载到内容，进入媒体页刷新 MotionBGs 或切换 Workshop。"
                    }
                    HomeStrip {
                        title: "精选壁纸"
                        subtitle: "只展示静态壁纸结果，避免和动态壁纸重复。"
                        targetTab: "wallpaper"
                        modelDataList: homePage.wallpaperList
                        emptyText: "壁纸列表还没有内容，进入壁纸页搜索或刷新。"
                    }
                    HomeStrip {
                        title: "动漫推荐"
                        subtitle: "Bangumi 热门番剧，和壁纸/动态壁纸完全分开。"
                        targetTab: "anime"
                        modelDataList: homePage.animeList
                        emptyText: "动漫推荐还没有返回结果，进入动漫页刷新。"
                    }
                }
            }
        }
    }

    component WallpaperPage: PageFrame {
        id: wallpaperPage
        property var items: app.wallpapers || []
        property var heroItem: items.length ? items[0] : null
        property string selectedSource: app.settings.wallpaperSource || "auto"

        background: Item {
            clip: true

            Rectangle {
                anchors.fill: parent
                color: "#0d1416"
            }

            MediaArtwork {
                id: wallpaperSoftBackdrop
                anchors.fill: parent
                item: wallpaperPage.heroItem
                opacity: 0.42
            }

            MultiEffect {
                anchors.fill: wallpaperSoftBackdrop
                source: wallpaperSoftBackdrop
                blurEnabled: true
                blur: 0.86
                blurMax: 72
                brightness: -0.18
                saturation: -0.16
                opacity: 0.82
            }

            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    GradientStop { position: 0; color: "#8236454b" }
                    GradientStop { position: 0.42; color: "#ad172125" }
                    GradientStop { position: 1; color: "#e60b1113" }
                }
            }

            Rectangle {
                anchors.fill: parent
                color: "#167fa3a8"
            }
        }
        contentHeight: wallpaperColumn.y + wallpaperColumn.implicitHeight + 62

        ColumnLayout {
            id: wallpaperColumn
            x: 48
            y: 104
            width: wallpaperPage.availableWidth - 96
            spacing: 18

            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 8
                Layout.rightMargin: 8
                spacing: 14

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4

                    Label {
                        text: "壁纸探索"
                        color: root.ink
                        font.pixelSize: 34
                        font.bold: true
                    }

                    Label {
                        text: "Wallhaven 与 4KWallpapers 搜索、下载和 Linux 桌面应用。"
                        color: "#cfd7d4"
                        font.pixelSize: 15
                    }
                }

                Pill { text: wallpaperPage.items.length + " 张"; fill: "#66364247" }
                Pill { text: wallpaperPage.selectedSource === "4kwallpapers" ? "4KWallpapers" : wallpaperPage.selectedSource === "wallhaven" ? "Wallhaven" : "自动源"; fill: "#66364247" }
                Pill { text: "第 " + root.wallpaperPageNumber + " 页"; fill: "#66364247" }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 8
                Layout.rightMargin: 8
                spacing: 14

                Label {
                    text: "精选结果"
                    color: root.ink
                    font.pixelSize: 25
                    font.bold: true
                }

                Label {
                    text: "点击应用，保存到本地库。"
                    color: "#c2cbc8"
                    font.pixelSize: 14
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }

                Label {
                    text: wallpaperPage.items.length + " 张"
                    color: "#ecf0ef"
                    font.pixelSize: 14
                    font.bold: true
                }
            }

            ResponsiveGrid {
                modelDataList: wallpaperPage.items
                kind: "wallpaper"
                minCellWidth: 360
                cardHeight: 226
                rowGap: 26
            }
        }
    }

    component MediaPage: PageFrame {
        id: mediaPage
        property var primaryItems: app.mediaMode === 0 ? app.media : app.mediaMode === 1 ? app.workshop : app.libraryMedia
        property var fallbackItems: app.mediaMode === 0
            ? (app.workshop && app.workshop.length ? app.workshop : app.libraryMedia)
            : (app.mediaMode === 1 ? app.libraryMedia : [])
        property var displayItems: primaryItems && primaryItems.length ? primaryItems : fallbackItems
        property var backdropItem: displayItems && displayItems.length ? displayItems[0]
            : (app.wallpapers && app.wallpapers.length ? app.wallpapers[0] : null)
        property string modeLabel: app.mediaMode === 0 ? "MotionBGs" : app.mediaMode === 1 ? "Workshop" : "本地"
        property string displayKind: app.mediaMode === 1 || (!(primaryItems && primaryItems.length) && app.mediaMode === 0 && app.workshop && app.workshop.length) ? "workshop" : "media"

        background: Item {
            clip: true

            Rectangle {
                anchors.fill: parent
                color: "#0d1416"
            }

            MediaArtwork {
                id: mediaSoftBackdrop
                anchors.fill: parent
                item: mediaPage.backdropItem
                opacity: 0.42
            }

            MultiEffect {
                anchors.fill: mediaSoftBackdrop
                source: mediaSoftBackdrop
                blurEnabled: true
                blur: 0.86
                blurMax: 72
                brightness: -0.18
                saturation: -0.16
                opacity: 0.82
            }

            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    GradientStop { position: 0; color: "#7636454b" }
                    GradientStop { position: 0.45; color: "#a9162125" }
                    GradientStop { position: 1; color: "#e90b1113" }
                }
            }

            Rectangle {
                anchors.fill: parent
                color: "#146f94a0"
            }
        }
        contentHeight: mediaColumn.y + mediaColumn.implicitHeight + 62

        ColumnLayout {
            id: mediaColumn
            x: 48
            y: 104
            width: mediaPage.availableWidth - 96
            spacing: 18

            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 8
                Layout.rightMargin: 8
                spacing: 14

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4

                    Label {
                        text: "媒体与动态壁纸"
                        color: root.ink
                        font.pixelSize: 34
                        font.bold: true
                    }

                    Label {
                        text: "MotionBGs、Steam Workshop 和本地视频在同一页切换，不跳转。"
                        color: "#cfd7d4"
                        font.pixelSize: 15
                    }
                }

                Pill { text: mediaPage.displayItems.length + " 项"; fill: "#66364247" }
                Pill { text: mediaPage.modeLabel; fill: "#66364247" }
                Pill { visible: app.mediaMode !== 2; text: "第 " + root.mediaPageNumber + " 页"; fill: "#66364247" }
            }

            Label {
                visible: app.mediaMode === 2
                text: "本地目录：" + (app.paths.media || "")
                color: "#cfd7d4"
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                Layout.leftMargin: 8
                Layout.rightMargin: 8
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 8
                Layout.rightMargin: 8
                spacing: 14

                Label {
                    text: app.mediaMode === 2 ? "本地媒体" : "精选动态"
                    color: root.ink
                    font.pixelSize: 25
                    font.bold: true
                }

                Label {
                    text: mediaPage.primaryItems && mediaPage.primaryItems.length ? "点击应用为动态壁纸，保存到本地库。" : "当前来源暂无内容，已显示可用的备用内容。"
                    color: "#c2cbc8"
                    font.pixelSize: 14
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }

                Label {
                    text: mediaPage.displayItems.length + " 项"
                    color: "#ecf0ef"
                    font.pixelSize: 14
                    font.bold: true
                }
            }

            ResponsiveGrid {
                modelDataList: mediaPage.displayItems
                kind: mediaPage.displayKind
                minCellWidth: 360
                cardHeight: 226
                rowGap: 26
            }

            Rectangle {
                visible: mediaPage.displayItems.length === 0
                Layout.fillWidth: true
                Layout.preferredHeight: 180
                radius: 30
                color: "#20ffffff"
                border.color: "#2effffff"

                ColumnLayout {
                    anchors.centerIn: parent
                    width: Math.min(520, parent.width - 64)
                    spacing: 14

                    Label {
                        text: "还没有媒体内容"
                        color: root.ink
                        font.pixelSize: 22
                        font.bold: true
                        horizontalAlignment: Text.AlignHCenter
                        Layout.fillWidth: true
                    }

                    Label {
                        text: "可以切换 Workshop、本地，或点击右上角搜索。"
                        color: "#cfd7d4"
                        font.pixelSize: 15
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }

                    GlassButton {
                        text: "搜索"
                        primary: true
                        Layout.alignment: Qt.AlignHCenter
                        onClicked: root.openMediaSearch()
                    }
                }
            }
        }
    }

    component AnimePage: ContentPane {
        id: animePage
        property int page: 1
        function reload() { app.loadAnime(animeQuery.text, page) }

        ColumnLayout {
            x: 34
            y: 92
            width: parent.width - 68
            spacing: 18
            SectionTitle { title: "动漫探索"; subtitle: "Bangumi 热门与搜索，保留条目资料和外部详情入口。" }
            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                SearchField { id: animeQuery; Layout.fillWidth: true; placeholderText: "搜索番剧、角色、标签" }
                GlassButton { text: "搜索"; primary: true; onClicked: { animePage.page = 1; animePage.reload() } }
                GlassButton { text: "刷新"; onClicked: { animeQuery.text = ""; animePage.page = 1; animePage.reload() } }
                GlassButton { text: "上一页"; enabled: animePage.page > 1; onClicked: { animePage.page = Math.max(1, animePage.page - 1); animePage.reload() } }
                Label { text: "第 " + animePage.page + " 页"; color: root.muted; Layout.preferredWidth: 76; horizontalAlignment: Text.AlignHCenter }
                GlassButton { text: "下一页"; onClicked: { animePage.page += 1; animePage.reload() } }
            }
            ResponsiveGrid { modelDataList: app.anime; kind: "anime" }
        }
    }

    component LibraryPage: PageFrame {
        ColumnLayout {
            x: 34
            y: 92
            width: parent.width - 68
            spacing: 24
            SectionTitle { title: "我的库"; subtitle: "下载目录：" + (app.paths.downloads || "") }
            RowLayout {
                GlassButton { text: "刷新"; primary: true; onClicked: app.loadLibrary() }
                GlassButton { text: "打开文件夹"; onClicked: app.openLibraryFolder() }
            }
            SectionTitle { title: "壁纸下载" }
            ResponsiveGrid { modelDataList: app.libraryWallpapers; kind: "wallpaper" }
            SectionTitle { title: "媒体下载" }
            ResponsiveGrid { modelDataList: app.libraryMedia; kind: "media" }
            SectionTitle { title: "Workshop 内容" }
            ListView {
                Layout.fillWidth: true
                Layout.preferredHeight: 230
                model: app.libraryWorkshop
                clip: true
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    height: 54
                    radius: 16
                    color: "#2d171a1d"
                    border.color: "#22ffffff"
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        Label { text: modelData.title || modelData.id; color: root.ink; Layout.fillWidth: true; elide: Text.ElideRight; font.bold: true }
                        GlassButton { text: "应用"; implicitHeight: 36; onClicked: app.applyWorkshop(modelData) }
                    }
                }
            }
        }
    }

    component SettingsPage: PageFrame {
        ColumnLayout {
            x: 34
            y: 92
            width: parent.width - 68
            spacing: 18
            SectionTitle { title: "设置"; subtitle: "旧设置文件继续使用 ~/.local/share/WaifuX/linux-state.json。" }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "SteamCMD"; color: root.muted; Layout.preferredWidth: 160 }
                SearchField { text: app.settings.steamcmdPath || ""; Layout.fillWidth: true; onEditingFinished: app.updateSetting("steamcmdPath", text) }
            }
            RowLayout {
                Layout.fillWidth: true
                Label { text: "动态壁纸模式"; color: root.muted; Layout.preferredWidth: 160 }
                ComboBox {
                    model: ["auto", "deepin-native-plugin", "deepin-embedded-mpv", "xwinwrap-icon-overlay"]
                    currentIndex: Math.max(0, model.indexOf(app.settings.liveWallpaperMode || "auto"))
                    onActivated: app.updateSetting("liveWallpaperMode", currentText)
                }
            }
            RowLayout {
                GlassButton { text: "重新检查依赖"; primary: true; onClicked: app.checkDependencies() }
                GlassButton { text: "生成安装脚本"; onClicked: app.writeDependencyInstallScript() }
                GlassButton { text: "打开下载目录"; onClicked: app.openLibraryFolder() }
            }
            ListView {
                Layout.fillWidth: true
                Layout.preferredHeight: 520
                model: app.dependencies
                clip: true
                delegate: Rectangle {
                    required property int index
                    required property var modelData
                    width: ListView.view.width
                    height: 48
                    radius: 12
                    color: index % 2 ? "#20191c1f" : "#2c191c1f"
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        Label { text: modelData.name; color: root.ink; Layout.preferredWidth: 230; font.bold: true }
                        Label { text: modelData.ok ? "可用" : "缺失"; color: modelData.ok ? "#78e6aa" : "#ff716b"; Layout.preferredWidth: 80; font.bold: true }
                        Label { text: modelData.path || ""; color: root.muted; Layout.fillWidth: true; elide: Text.ElideMiddle }
                    }
                }
            }
        }
    }

    component ResponsiveGrid: GridView {
        id: responsiveGrid
        property var modelDataList
        property string kind
        property bool viewportGrid: false
        property int minCellWidth: 330
        property int cardHeight: 198
        property int rowGap: 20
        Layout.fillWidth: true
        Layout.fillHeight: viewportGrid
        Layout.preferredHeight: viewportGrid ? 280 : Math.max(cardHeight + rowGap, Math.ceil((modelDataList ? modelDataList.length : 0) / Math.max(1, Math.floor(width / minCellWidth))) * (cardHeight + rowGap))
        cellWidth: Math.max(292, Math.floor(width / Math.max(1, Math.floor(width / minCellWidth))))
        cellHeight: cardHeight + rowGap
        model: modelDataList || []
        clip: true
        interactive: viewportGrid
        boundsBehavior: Flickable.StopAtBounds
        cacheBuffer: 900
        reuseItems: true
        delegate: CatalogCard {
            required property var modelData
            item: modelData
            kind: responsiveGrid.kind
            width: GridView.view.cellWidth - 18
            height: responsiveGrid.cardHeight
            onPrimary: {
                if (kind === "wallpaper") app.applyWallpaper(item)
                else if (kind === "workshop") app.downloadWorkshop(item)
                else app.applyLiveWallpaper(item)
            }
            onSecondary: {
                if (kind === "wallpaper") app.downloadWallpaper(item)
                else if (kind === "workshop") app.downloadWorkshop(item)
                else app.downloadMedia(item)
            }
        }
    }
}
