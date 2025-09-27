#!/bin/bash

extensiones=("ts" "tsx" "js" "json" "mjs" "cjs")
excluir=("node_modules" ".git" "dist" "uploads")

output="AllCode.txt"
> "$output"

find . -type f | while read -r archivo; do
    extension="${archivo##*.}"
    en_excluidas=false

    for carpeta in "${excluir[@]}"; do
        if [[ "$archivo" == "/$carpeta/" ]]; then
            en_excluidas=true
            break
        fi
    done

    if [[ " ${extensiones[*]} " == *" $extension " && $en_excluidas == false ]]; then
        echo "----- FILE: $archivo -----" >> "$output"
        cat "$archivo" >> "$output" 2>> "$output"
        echo -e "\n\n" >> "$output"
    fi
done
