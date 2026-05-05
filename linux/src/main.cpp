#include "AppController.h"

#include <QCoreApplication>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QIcon>
#include <QObject>
#include <QPainterPath>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QRegion>
#include <QTimer>

namespace {
void applyRoundedWindowMask(QQuickWindow *window)
{
    if (!window)
        return;

    constexpr int margin = 10;
    constexpr int radius = 28;
    const int width = window->width();
    const int height = window->height();
    if (width <= margin * 2 || height <= margin * 2)
        return;

    QPainterPath path;
    path.addRoundedRect(QRectF(margin, margin, width - margin * 2, height - margin * 2), radius, radius);
    window->setMask(QRegion(path.toFillPolygon().toPolygon()));
}
}

int main(int argc, char *argv[])
{
    QQuickWindow::setDefaultAlphaBuffer(true);

    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName(QStringLiteral("WaifuX"));
    QGuiApplication::setOrganizationName(QStringLiteral("WaifuX"));
    QGuiApplication::setApplicationVersion(QStringLiteral(WAIFUX_VERSION));
    QGuiApplication::setWindowIcon(QIcon(QStringLiteral(":/icon.png")));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    AppController controller;

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("app"), &controller);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
        &app, [] { QCoreApplication::exit(-1); }, Qt::QueuedConnection);
    engine.load(QUrl(QStringLiteral("qrc:/qml/Main.qml")));
    if (auto *window = qobject_cast<QQuickWindow *>(engine.rootObjects().value(0))) {
        applyRoundedWindowMask(window);
        QObject::connect(window, &QQuickWindow::widthChanged, window, [window] { applyRoundedWindowMask(window); });
        QObject::connect(window, &QQuickWindow::heightChanged, window, [window] { applyRoundedWindowMask(window); });
    }

    QTimer::singleShot(0, &controller, &AppController::initialize);
    return app.exec();
}
