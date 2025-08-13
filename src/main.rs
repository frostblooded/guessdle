use actix_web::{App, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .service(actix_files::Files::new("/", "./")
                .index_file("index.html")
                .use_last_modified(true)
            )
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
