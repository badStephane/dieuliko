// Command admin manages administrator accounts:
//
//	admin create -email admin@dieuliko.sn -first Awa -last Diop
//
// The password is read from ADMIN_PASSWORD, or prompted twice without echo.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"

	"golang.org/x/term"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/config"
	"github.com/badStephane/dieuliko/apps/api/internal/database"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("admin failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 || args[0] != "create" {
		return errors.New("usage: admin create -email <email> -first <first name> -last <last name>")
	}
	flags := flag.NewFlagSet("create", flag.ContinueOnError)
	email := flags.String("email", "", "administrator email")
	first := flags.String("first", "", "first name")
	last := flags.String("last", "", "last name")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}

	password, err := readPassword()
	if err != nil {
		return err
	}
	cfg, err := config.Load(os.LookupEnv)
	if err != nil {
		return err
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	// Creating an admin sends no email, so no mailer is needed.
	accounts, err := auth.NewService(pool, nil, slog.Default(), auth.DefaultConfig(cfg.AppBaseURL))
	if err != nil {
		return err
	}
	user, err := accounts.CreateAdmin(ctx, auth.RegisterInput{Email: *email, Password: password, FirstName: *first, LastName: *last})
	var validation *auth.ValidationError
	if errors.As(err, &validation) {
		return fmt.Errorf("invalid input: %v", validation.Fields)
	}
	if err != nil {
		return err
	}
	slog.Info("admin created", slog.String("id", user.ID.String()), slog.String("email", user.Email))
	return nil
}

func readPassword() (string, error) {
	if password, ok := os.LookupEnv("ADMIN_PASSWORD"); ok {
		return password, nil
	}
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return "", errors.New("set ADMIN_PASSWORD or run in a terminal to be prompted")
	}
	first, err := prompt(fd, "Mot de passe : ")
	if err != nil {
		return "", err
	}
	second, err := prompt(fd, "Confirmez le mot de passe : ")
	if err != nil {
		return "", err
	}
	if first != second {
		return "", errors.New("passwords do not match")
	}
	return first, nil
}

func prompt(fd int, label string) (string, error) {
	if _, err := io.WriteString(os.Stderr, label); err != nil {
		return "", err
	}
	password, err := term.ReadPassword(fd)
	_, _ = io.WriteString(os.Stderr, "\n")
	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}
	return string(password), nil
}
