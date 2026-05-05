cmake_minimum_required(VERSION 3.24)

project(WaifuXLinux VERSION 38.0.94 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick QuickControls2 Network)

qt_add_executable(waifux-linux
    src/main.cpp
    src/AppController.cpp
    src/AppController.h
)

qt_add_resources(waifux-linux qml_resources
    PREFIX "/"
    FILES
        icon.png
        qml/Main.qml
)

target_link_libraries(waifux-linux
    PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::Qml
        Qt6::Quick
        Qt6::QuickControls2
        Qt6::Network
)

target_compile_definitions(waifux-linux PRIVATE
    WAIFUX_VERSION="${PROJECT_VERSION}"
)

install(TARGETS waifux-linux RUNTIME DESTINATION bin)
install(FILES icon.png DESTINATION share/icons/hicolor/256x256/apps RENAME waifux-linux.png)

configure_file(${CMAKE_CURRENT_SOURCE_DIR}/waifux-linux.desktop.in
    ${CMAKE_CURRENT_BINARY_DIR}/waifux-linux.desktop
    @ONLY
)
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/waifux-linux.desktop DESTINATION share/applications)

set(CPACK_PACKAGE_NAME "waifux-linux")
set(CPACK_PACKAGE_VENDOR "WaifuX Linux")
set(CPACK_PACKAGE_CONTACT "WaifuX Linux <waifux@example.invalid>")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_GENERATOR "DEB")
set(CPACK_DEBIAN_PACKAGE_SECTION "graphics")
set(CPACK_DEBIAN_PACKAGE_PRIORITY "optional")
set(CPACK_DEBIAN_PACKAGE_SHLIBDEPS ON)
set(CPACK_DEBIAN_PACKAGE_DEPENDS
    "qml6-module-qtquick, qml6-module-qtquick-controls, qml6-module-qtquick-effects, qml6-module-qtquick-layouts, qml6-module-qtquick-window, qml6-module-qtquick-dialogs, xdg-utils, ffmpeg, mpv, x11-utils"
)
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "WaifuX Linux Qt/QML desktop app")
set(CPACK_DEBIAN_FILE_NAME "waifux-linux_${PROJECT_VERSION}_amd64.deb")
include(CPack)
