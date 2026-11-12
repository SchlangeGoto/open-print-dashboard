from app.utils import render_email_template


def test_new_account_email_never_renders_a_password() -> None:
    # The template is given a password on purpose: it must not render it even
    # if a caller passes one again.
    html = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": "OpenPrintDashboard",
            "username": "new@example.com",
            "email": "new@example.com",
            "link": "http://localhost:3000",
            "password": "super-secret-password",
        },
    )

    assert "super-secret-password" not in html
